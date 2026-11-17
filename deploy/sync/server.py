#!/usr/bin/env python3
"""
Repeat sync — маленький сервер синхронизации между устройствами.

Без зависимостей: только стандартная библиотека Python. Слушает 127.0.0.1,
наружу его отдаёт nginx по пути /api/.

Авторизация — Telegram Mini App initData: подпись проверяется токеном бота
(BOT_TOKEN в /etc/repeat-sync.env), пользователь = Telegram user id. Пароля нет.

Модель данных — записи (коллекция + id) с меткой времени `ts`. Клиент шлёт
изменённые записи, сервер оставляет более свежую (last write wins), удаление —
запись с data=null. Ответ: всё, что изменилось после курсора клиента, плюс
текущие версии присланных записей (если сервер оставил свою — клиент её примет).

Хранение — JSON-файл на пользователя в DATA_DIR, раз в день копия в backups/.
"""
import hashlib
import hmac
import json
import os
import shutil
import threading
import time
import urllib.parse
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
DATA_DIR = os.environ.get("DATA_DIR", "/var/lib/repeat-sync")
PORT = int(os.environ.get("PORT", "8787"))
# Через запятую: кому можно хранить данные. Пусто — всем, кто открыл бота.
ALLOWED = {u.strip() for u in os.environ.get("ALLOWED_USERS", "").split(",") if u.strip()}
MAX_BODY = 25 * 1024 * 1024
AUTH_MAX_AGE = 30 * 24 * 3600
BACKUP_KEEP = 30
COLLECTIONS = {
    "sessions", "customExercises", "cardioKinds", "mobilityKinds",
    "bodyEntries", "programs", "recovery", "settings",
}

lock = threading.Lock()


def verify_init_data(init_data: str):
    """user id из подписанного initData или None."""
    if not BOT_TOKEN or not init_data:
        return None
    pairs = urllib.parse.parse_qsl(init_data, keep_blank_values=True)
    fields = dict(pairs)
    received = fields.pop("hash", "")
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        return None
    try:
        if time.time() - int(fields.get("auth_date", "0")) > AUTH_MAX_AGE:
            return None
        uid = str(json.loads(fields["user"])["id"])
    except (KeyError, ValueError, TypeError):
        return None
    if ALLOWED and uid not in ALLOWED:
        return None
    return uid


def user_path(uid: str) -> str:
    return os.path.join(DATA_DIR, f"{int(uid)}.json")


def load_state(uid: str) -> dict:
    try:
        with open(user_path(uid), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"rev": 0, "records": {}}


def save_state(uid: str, state: dict) -> None:
    path = user_path(uid)
    # Ежедневная копия перед первой записью дня.
    bdir = os.path.join(DATA_DIR, "backups")
    os.makedirs(bdir, exist_ok=True)
    stamp = os.path.join(bdir, f"{int(uid)}-{date.today().isoformat()}.json")
    if os.path.exists(path) and not os.path.exists(stamp):
        shutil.copy2(path, stamp)
        old = sorted(p for p in os.listdir(bdir) if p.startswith(f"{int(uid)}-"))
        for p in old[:-BACKUP_KEEP]:
            os.remove(os.path.join(bdir, p))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def sync(uid: str, body: dict) -> dict:
    since = int(body.get("since") or 0)
    changes = body.get("changes") or []
    with lock:
        state = load_state(uid)
        records = state["records"]
        touched = set()
        dirty = False
        for ch in changes:
            c, rid, ts = ch.get("c"), ch.get("id"), ch.get("ts")
            if c not in COLLECTIONS or not isinstance(rid, str) or not rid or len(rid) > 300:
                continue
            if not isinstance(ts, (int, float)):
                continue
            key = f"{c}\u0000{rid}"
            touched.add(key)
            cur = records.get(key)
            if cur is None or ts > cur["ts"] or (ts == cur["ts"] and ch.get("data") != cur["data"]):
                state["rev"] += 1
                records[key] = {"c": c, "id": rid, "ts": ts, "rev": state["rev"], "data": ch.get("data")}
                dirty = True
        if dirty:
            save_state(uid, state)
        out = [
            {"c": r["c"], "id": r["id"], "ts": r["ts"], "data": r["data"]}
            for k, r in records.items()
            if r["rev"] > since or k in touched
        ]
        return {"rev": state["rev"], "changes": out}


class Handler(BaseHTTPRequestHandler):
    server_version = "repeat-sync"

    def _send(self, code: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _uid(self):
        auth = self.headers.get("Authorization", "")
        return verify_init_data(auth[4:]) if auth.startswith("tma ") else None

    def do_GET(self):
        if self.path == "/api/health":
            return self._send(200, {"ok": True, "configured": bool(BOT_TOKEN)})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/sync":
            return self._send(404, {"error": "not found"})
        uid = self._uid()
        if not uid:
            return self._send(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._send(413, {"error": "bad size"})
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            return self._send(400, {"error": "bad json"})
        self._send(200, sync(uid, body))

    def log_message(self, fmt, *args):  # без IP и initData в логах
        pass


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
