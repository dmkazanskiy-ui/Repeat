#!/usr/bin/env python3
"""
Repeat sync — сервер синхронизации между устройствами.

Без зависимостей: только стандартная библиотека Python. Слушает 127.0.0.1,
наружу его отдаёт nginx по пути /api/ (там же лимит запросов по IP).

Авторизация — Telegram Mini App initData: подпись проверяется токеном бота
(BOT_TOKEN в /etc/repeat-sync.env), пользователь = Telegram user id из
подписанных данных. Подделать чужой id без токена бота нельзя; id и имя
пользователя нигде не возвращаются и не пишутся в логи.

Модель данных — записи (коллекция + id) с меткой времени `ts`. Клиент шлёт
изменённые записи, сервер оставляет более свежую (last write wins), удаление —
запись с data=null. Ответ: всё, что изменилось после курсора клиента, плюс
текущие версии присланных записей.

`epoch` — случайный номер «жизни» аккаунта. После удаления аккаунта он
меняется, и другие устройства, увидев чужой epoch, стирают у себя данные,
а не заливают их обратно.

Хранение — JSON-файл на пользователя, раз в день копия в backups/ (30 шт.).
Лимиты: 10 МБ данных на человека, 60 запросов в минуту на человека.
"""
import hashlib
import hmac
import json
import math
import os
import secrets
import shutil
import threading
import time
import urllib.parse
from collections import deque
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
DATA_DIR = os.environ.get("DATA_DIR", "/var/lib/repeat-sync")
PORT = int(os.environ.get("PORT", "8787"))
# Через запятую: кому можно хранить данные. Пусто — всем, кто открыл бота.
ALLOWED = {u.strip() for u in os.environ.get("ALLOWED_USERS", "").split(",") if u.strip()}
MAX_BODY = 11 * 1024 * 1024
QUOTA_BYTES = 10 * 1024 * 1024
# initData выдаётся Telegram при каждом открытии; старше суток не принимаем,
# чтобы перехваченная строка не жила долго.
AUTH_MAX_AGE = 24 * 3600
RATE_LIMIT = 60  # запросов в минуту на пользователя
BACKUP_KEEP = 30
MAX_CHANGES = 20000
COLLECTIONS = {
    "sessions", "customExercises", "cardioKinds", "mobilityKinds",
    "bodyEntries", "programs", "recovery", "settings",
}

lock = threading.Lock()
rate_lock = threading.Lock()
hits: dict[str, deque] = {}


class ApiError(Exception):
    def __init__(self, code: int, error: str):
        self.code, self.error = code, error


def verify_init_data(init_data: str):
    """Telegram user id из подписанного initData или None."""
    if not BOT_TOKEN or not init_data or len(init_data) > 8192:
        return None
    try:
        pairs = urllib.parse.parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError:
        return None
    fields = dict(pairs)
    if len(fields) != len(pairs):  # повторяющиеся ключи — подозрительно
        return None
    received = fields.pop("hash", "")
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        return None
    try:
        age = time.time() - int(fields.get("auth_date", "0"))
        if age > AUTH_MAX_AGE or age < -300:
            return None
        uid = json.loads(fields["user"])["id"]
        if not isinstance(uid, int) or uid <= 0:
            return None
        uid = str(uid)
    except (KeyError, ValueError, TypeError):
        return None
    if ALLOWED and uid not in ALLOWED:
        return None
    return uid


def rate_ok(uid: str) -> bool:
    now = time.monotonic()
    with rate_lock:
        q = hits.setdefault(uid, deque())
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return False
        q.append(now)
        if len(hits) > 50000:  # не копим память на брошенных
            for k in [k for k, v in hits.items() if not v or now - v[-1] > 60]:
                hits.pop(k, None)
        return True


def user_path(uid: str) -> str:
    return os.path.join(DATA_DIR, f"{int(uid)}.json")


def tombstone_path(uid: str) -> str:
    # Метка удаления хранит не id, а его HMAC (ключ — токен бота): по файлу
    # нельзя узнать, кто удалялся, даже перебором id.
    h = hmac.new(BOT_TOKEN.encode(), f"repeat-deleted:{int(uid)}".encode(), hashlib.sha256).hexdigest()
    return os.path.join(DATA_DIR, f"deleted-{h}")


def read_tombstone(uid: str):
    try:
        with open(tombstone_path(uid), encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return None


def backup_dir() -> str:
    return os.path.join(DATA_DIR, "backups")


def load_state(uid: str):
    try:
        with open(user_path(uid), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def save_state(uid: str, state: dict, raw: bytes) -> None:
    path = user_path(uid)
    bdir = backup_dir()
    os.makedirs(bdir, exist_ok=True)
    stamp = os.path.join(bdir, f"{int(uid)}-{date.today().isoformat()}.json")
    if os.path.exists(path) and not os.path.exists(stamp):
        shutil.copy2(path, stamp)
        mine = sorted(p for p in os.listdir(bdir) if p.startswith(f"{int(uid)}-"))
        for p in mine[:-BACKUP_KEEP]:
            os.remove(os.path.join(bdir, p))
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(raw)
    os.replace(tmp, path)


def valid_change(ch) -> bool:
    if not isinstance(ch, dict):
        return False
    c, rid, ts = ch.get("c"), ch.get("id"), ch.get("ts")
    if c not in COLLECTIONS or not isinstance(rid, str) or not (0 < len(rid) <= 300):
        return False
    if isinstance(ts, bool) or not isinstance(ts, (int, float)) or not math.isfinite(ts) or ts < 0:
        return False
    return True


def sync(uid: str, body) -> dict:
    if not isinstance(body, dict):
        raise ApiError(400, "bad request")
    since, epoch, changes = body.get("since", 0), body.get("epoch"), body.get("changes", [])
    if isinstance(since, bool) or not isinstance(since, int) or since < 0:
        raise ApiError(400, "bad request")
    if not isinstance(changes, list) or len(changes) > MAX_CHANGES:
        raise ApiError(400, "bad request")
    with lock:
        state = load_state(uid)
        # Устройство помнит другую «жизнь» аккаунта — аккаунт удаляли.
        # Ничего не принимаем: клиент сотрёт локальные данные и начнёт заново.
        # Нет файла и нет метки удаления (например, сервер восстановили
        # пустым) — не стираем устройства, а принимаем их данные заново.
        if epoch:
            if state is not None and state.get("epoch") != epoch:
                return {"reset": True, "epoch": state["epoch"]}
            if state is None and read_tombstone(uid) == epoch:
                return {"reset": True, "epoch": None}
        if state is None:
            state = {"epoch": secrets.token_hex(8), "rev": 0, "records": {}}
        records = state["records"]
        touched = set()
        dirty = False
        for ch in changes:
            if not valid_change(ch):
                continue
            key = f"{ch['c']}\u0000{ch['id']}"
            touched.add(key)
            cur = records.get(key)
            data = ch.get("data")
            if cur is None and data is None:
                continue
            if cur is None or ch["ts"] > cur["ts"] or (ch["ts"] == cur["ts"] and data != cur["data"]):
                state["rev"] += 1
                records[key] = {"c": ch["c"], "id": ch["id"], "ts": ch["ts"], "rev": state["rev"], "data": data}
                dirty = True
        if dirty:
            raw = json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode()
            if len(raw) > QUOTA_BYTES:
                raise ApiError(413, "quota")
            save_state(uid, state, raw)
            try:
                os.remove(tombstone_path(uid))
            except FileNotFoundError:
                pass
        out = [
            {"c": r["c"], "id": r["id"], "ts": r["ts"], "data": r["data"]}
            for k, r in records.items()
            if r["rev"] > since or k in touched
        ]
        return {"epoch": state["epoch"], "rev": state["rev"], "changes": out}


def delete_account(uid: str) -> dict:
    """Стереть всё: данные и все копии. Восстановить нельзя."""
    with lock:
        state = load_state(uid)
        if state is not None:
            with open(tombstone_path(uid), "w", encoding="utf-8") as f:
                f.write(state.get("epoch", ""))
        try:
            os.remove(user_path(uid))
        except FileNotFoundError:
            pass
        bdir = backup_dir()
        if os.path.isdir(bdir):
            for p in os.listdir(bdir):
                if p.startswith(f"{int(uid)}-"):
                    os.remove(os.path.join(bdir, p))
    return {"deleted": True}


class Handler(BaseHTTPRequestHandler):
    server_version = "repeat-sync"
    sys_version = ""
    timeout = 20

    def _send(self, code: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _auth(self) -> str:
        auth = self.headers.get("Authorization", "")
        uid = verify_init_data(auth[4:]) if auth.startswith("tma ") else None
        if not uid:
            raise ApiError(401, "unauthorized")
        if not rate_ok(uid):
            raise ApiError(429, "rate")
        return uid

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "bad request")
        if length <= 0 or length > MAX_BODY:
            raise ApiError(413, "bad size")
        try:
            return json.loads(self.rfile.read(length))
        except (ValueError, RecursionError):
            raise ApiError(400, "bad json")

    def _handle(self, fn) -> None:
        try:
            self._send(200, fn())
        except ApiError as e:
            self._send(e.code, {"error": e.error})
        except Exception:  # без подробностей наружу
            self._send(500, {"error": "server"})

    def do_GET(self):
        if self.path == "/api/health":
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/api/sync":
            return self._handle(lambda: sync(self._auth(), self._body()))
        if self.path == "/api/account/delete":
            return self._handle(lambda: delete_account(self._auth()))
        self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # без IP и initData в логах
        pass


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
