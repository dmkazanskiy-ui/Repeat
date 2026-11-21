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

Аккаунт всегда = Telegram user id. Каналы входа — только «ключи» к нему:
  • Mini App — подпись initData (Authorization: tma …);
  • браузер — вход через бота: сайт получает одноразовый код, человек
    открывает t.me/<бот>?start=login_<код> и жмёт «Войти» в чате. Бот
    подтверждает id из Telegram, сайт забирает сессионный токен
    (Authorization: Bearer …). В meta.json хранится только sha256 токена.
Новый канал (почта, Google…) добавляется так же: он выдаёт сессию на уже
существующий Telegram id и сам аккаунт не создаёт.

Админка — для одного человека: при первом входе с юзернеймом ADMIN_USERNAME
его числовой id закрепляется в meta.json, дальше юзернейм не важен.
Журнал событий (events.log) — без IP и без содержимого тренировок.
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
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from datetime import date, datetime, timedelta
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
APP_URL = os.environ.get("APP_URL", "https://repeat.dm-kazanskiy.online/")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "dmkazanskiy").strip().lstrip("@").lower()
ADMIN_IDS = {u.strip() for u in os.environ.get("ADMIN_IDS", "").split(",") if u.strip()}
BOT_POLL = os.environ.get("BOT_POLL", "1") == "1"
# Адрес Bot API. С VPS в РФ api.telegram.org может быть недоступен — тогда
# сюда ставится свой прокси (например, Cloudflare Worker), который пересылает
# /bot<token>/<method> на api.telegram.org.
TG_API = os.environ.get("TG_API", "https://api.telegram.org").rstrip("/")
# Общий секрет с прокси (deploy/tg-relay): без него прокси не пускает.
TG_API_KEY = os.environ.get("TG_API_KEY", "").strip()
SESSION_TTL = 90 * 24 * 3600  # веб-сессия живёт 90 дней с последнего захода
LOGIN_TTL = 600  # код входа через бота — 10 минут
VISIT_GAP = 30 * 60  # новое посещение — после 30 минут тишины
EVENTS_MAX = 5 * 1024 * 1024
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
    """Пользователь Telegram (dict с id, username…) из подписанного initData или None."""
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
        user = json.loads(fields["user"])
        uid = user["id"]
        if not isinstance(uid, int) or isinstance(uid, bool) or uid <= 0:
            return None
    except (KeyError, ValueError, TypeError):
        return None
    return user


# ───────────── Учётные записи, сессии, журнал (meta.json, events.log) ─────────────

meta_lock = threading.RLock()
META: dict = {"admin": None, "users": {}, "sessions": {}}
meta_dirty = False


def meta_path() -> str:
    return os.path.join(DATA_DIR, "meta.json")


def events_path() -> str:
    return os.path.join(DATA_DIR, "events.log")


def load_meta() -> None:
    global META
    try:
        with open(meta_path(), encoding="utf-8") as f:
            data = json.load(f)
        META = {"admin": data.get("admin"), "users": data.get("users", {}), "sessions": data.get("sessions", {})}
    except FileNotFoundError:
        pass


def save_meta() -> None:
    global meta_dirty
    with meta_lock:
        raw = json.dumps(META, ensure_ascii=False, separators=(",", ":")).encode()
        tmp = meta_path() + ".tmp"
        with open(tmp, "wb") as f:
            f.write(raw)
        os.replace(tmp, meta_path())
        meta_dirty = False


def mark_dirty() -> None:
    """Мелкие правки (время последнего захода) пишутся пачкой раз в минуту."""
    global meta_dirty
    meta_dirty = True


def flusher() -> None:
    while True:
        time.sleep(60)
        if meta_dirty:
            try:
                save_meta()
            except OSError:
                pass


def clean_text(v, n: int = 64) -> str:
    return "".join(ch for ch in str(v or "") if ch.isprintable())[:n]


def tg_name(user: dict) -> str:
    return clean_text(" ".join(x for x in (user.get("first_name"), user.get("last_name")) if x), 80)


def log_event(e: str, uid=None, p: str = "", d: str = "") -> None:
    rec = {"t": int(time.time()), "e": e}
    if uid:
        rec["uid"] = str(uid)
    if p:
        rec["p"] = clean_text(p, 24)
    if d:
        rec["d"] = clean_text(d, 200)
    line = json.dumps(rec, ensure_ascii=False) + "\n"
    with meta_lock:
        path = events_path()
        with open(path, "a", encoding="utf-8") as f:
            f.write(line)
        try:
            if os.path.getsize(path) > EVENTS_MAX:  # держим вторую половину
                with open(path, encoding="utf-8") as f:
                    lines = f.readlines()
                with open(path + ".tmp", "w", encoding="utf-8") as f:
                    f.writelines(lines[len(lines) // 2:])
                os.replace(path + ".tmp", path)
        except OSError:
            pass


def read_events() -> list:
    out = []
    try:
        with open(events_path(), encoding="utf-8") as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    except FileNotFoundError:
        pass
    return out


def forget_events(uid: str) -> None:
    """Отзыв согласия: из журнала уходят и все строки человека."""
    with meta_lock:
        keep = [e for e in read_events() if e.get("uid") != uid]
        with open(events_path() + ".tmp", "w", encoding="utf-8") as f:
            f.writelines(json.dumps(e, ensure_ascii=False) + "\n" for e in keep)
        os.replace(events_path() + ".tmp", events_path())


def touch_user(uid: str, user=None, via: str = "") -> dict:
    """Завести/обновить запись о человеке. user — данные Telegram, если есть."""
    now = int(time.time())
    with meta_lock:
        u = META["users"].get(uid)
        new = u is None
        if new:
            u = {"first": now, "seen": now, "visits": 0, "blocked": False, "via": via or "tg"}
            META["users"][uid] = u
        if user:
            u["u"] = clean_text(user.get("username"), 40)
            u["n"] = tg_name(user)
            if user.get("language_code"):
                u["lang"] = clean_text(user.get("language_code"), 8)
            if not META.get("admin") and u["u"] and u["u"].lower() == ADMIN_USERNAME:
                META["admin"] = uid
                log_event("admin_pinned", uid)
        u["seen"] = now
        if new or user:
            save_meta()
        else:
            mark_dirty()
    if new:
        log_event("new_user", uid, via)
    return u


def is_admin(uid: str) -> bool:
    return uid in ADMIN_IDS or (META.get("admin") is not None and META.get("admin") == uid)


def is_blocked(uid: str) -> bool:
    u = META["users"].get(uid)
    return bool(u and u.get("blocked"))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(uid: str, p: str) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with meta_lock:
        META["sessions"][token_hash(token)] = {"uid": uid, "created": now, "seen": now, "p": clean_text(p, 24)}
        save_meta()
    return token


def session_uid(token: str):
    if not token or len(token) > 200:
        return None, None
    h = token_hash(token)
    now = int(time.time())
    with meta_lock:
        s = META["sessions"].get(h)
        if not s:
            return None, None
        if now - s.get("seen", 0) > SESSION_TTL:
            META["sessions"].pop(h, None)
            mark_dirty()
            return None, None
        s["seen"] = now
        mark_dirty()
        return s["uid"], h


def drop_sessions(uid: str) -> int:
    with meta_lock:
        gone = [h for h, s in META["sessions"].items() if s.get("uid") == uid]
        for h in gone:
            META["sessions"].pop(h, None)
        if gone:
            save_meta()
    return len(gone)


def hello(ident: dict, body) -> dict:
    """Открытие приложения: посещение в журнал, в ответ — кто я и админ ли."""
    uid = ident["uid"]
    p = clean_text((body or {}).get("platform") if isinstance(body, dict) else "", 24)
    with meta_lock:
        prev = META["users"].get(uid, {}).get("seen", 0)
        u = touch_user(uid, ident.get("user"), ident["via"])
        if u.get("visits", 0) == 0 or time.time() - prev > VISIT_GAP:
            u["visits"] = u.get("visits", 0) + 1
            u["plat"] = p or ident["via"]
            mark_dirty()
            log_event("visit", uid, p or ident["via"])
    return {
        "me": {"id": uid, "username": u.get("u", ""), "name": u.get("n", ""), "via": ident["via"]},
        "admin": is_admin(uid),
    }


# ───────────── Вход в браузере через бота ─────────────

login_lock = threading.Lock()
logins: dict[str, dict] = {}
# BOT_USERNAME можно задать явно (и для локальной проверки без сети).
bot_info = {"username": os.environ.get("BOT_USERNAME") or None, "polling": "off"}


def bot_api(method: str, params: dict, timeout: float = 10):
    req = urllib.request.Request(
        f"{TG_API}/bot{BOT_TOKEN}/{method}",
        data=json.dumps(params).encode(),
        # Свой User-Agent: Cloudflare режет стандартный «Python-urllib» (ошибка 1010).
        headers={"Content-Type": "application/json", "User-Agent": "repeat-sync/1.0", **({"X-Relay-Key": TG_API_KEY} if TG_API_KEY else {})},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = json.loads(r.read())
    if not body.get("ok"):
        raise RuntimeError(method)
    return body.get("result")


bot_fail_until = [0.0]


def bot_username():
    """Юзернейм бота (getMe). Неудачу помним 5 минут, чтобы не тормозить запросы."""
    if bot_info["username"] is None and BOT_TOKEN and time.time() >= bot_fail_until[0]:
        try:
            bot_info["username"] = bot_api("getMe", {}, timeout=5).get("username")
        except Exception:
            bot_fail_until[0] = time.time() + 300
            return None
    return bot_info["username"]


def clean_logins(now: float) -> None:
    for c in [c for c, v in logins.items() if now - v["t"] > LOGIN_TTL]:
        logins.pop(c, None)


def web_login_start() -> dict:
    bot = bot_username()
    if not bot:
        raise ApiError(503, "bot")
    now = time.time()
    with login_lock:
        clean_logins(now)
        if len(logins) > 2000:
            raise ApiError(429, "rate")
        code = secrets.token_urlsafe(16)
        logins[code] = {"t": now, "st": "pending"}
    return {"code": code, "url": f"https://t.me/{bot}?start=login_{code}", "ttl": LOGIN_TTL}


def web_login_poll(body) -> dict:
    code = body.get("code") if isinstance(body, dict) else None
    if not isinstance(code, str) or len(code) > 64:
        raise ApiError(400, "bad request")
    with login_lock:
        clean_logins(time.time())
        rec = logins.get(code)
        if not rec:
            return {"status": "expired"}
        if rec["st"] != "ok":
            if rec["st"] == "denied":
                logins.pop(code, None)
            return {"status": rec["st"]}
        logins.pop(code, None)  # код одноразовый
    user = rec["user"]
    uid = str(user["id"])
    touch_user(uid, user, "web")
    token = new_session(uid, clean_text(body.get("platform"), 24) or "web")
    log_event("login_web", uid, "web")
    return {"status": "ok", "token": token}


def logout(ident: dict) -> dict:
    if ident.get("sid"):
        with meta_lock:
            META["sessions"].pop(ident["sid"], None)
            save_meta()
        log_event("logout", ident["uid"], "web")
    return {"ok": True}


TEXTS = {
    "ru": {
        "confirm": "Войти в Repeat в браузере?\n\nЕсли вход запрашивали не вы — нажмите «Отмена» и никому не пересылайте ссылку.",
        "yes": "Войти", "no": "Отмена",
        "done": "✅ Вход подтверждён — вернитесь в браузер.",
        "denied": "Вход отменён.",
        "expired": "Ссылка для входа устарела. Начните заново на сайте.",
        "blocked": "Доступ к Repeat закрыт.",
        "hi": "Repeat — дневник тренировок. Откройте приложение кнопкой ниже.",
        "open": "Открыть Repeat",
    },
    "en": {
        "confirm": "Sign in to Repeat in your browser?\n\nIf it wasn't you, tap Cancel and don't forward the link to anyone.",
        "yes": "Sign in", "no": "Cancel",
        "done": "✅ Signed in — go back to your browser.",
        "denied": "Sign-in cancelled.",
        "expired": "This sign-in link has expired. Start again on the website.",
        "blocked": "Access to Repeat is closed.",
        "hi": "Repeat — a workout log. Open the app with the button below.",
        "open": "Open Repeat",
    },
}


def tx(user: dict, key: str) -> str:
    lang = "ru" if str(user.get("language_code", "ru")).startswith("ru") else "en"
    return TEXTS[lang][key]


def allowed(uid: str) -> bool:
    return (not ALLOWED or uid in ALLOWED) and not is_blocked(uid)


def handle_update(upd: dict) -> None:
    msg = upd.get("message")
    if msg and isinstance(msg.get("text"), str) and msg["text"].startswith("/start"):
        user, chat = msg.get("from", {}), msg["chat"]["id"]
        parts = msg["text"].split(maxsplit=1)
        param = parts[1] if len(parts) > 1 else ""
        if param.startswith("login_"):
            code = param[6:]
            with login_lock:
                ok = code in logins and logins[code]["st"] == "pending" and time.time() - logins[code]["t"] <= LOGIN_TTL
            if not ok:
                bot_api("sendMessage", {"chat_id": chat, "text": tx(user, "expired")})
                return
            bot_api("sendMessage", {
                "chat_id": chat,
                "text": tx(user, "confirm"),
                "reply_markup": {"inline_keyboard": [[
                    {"text": tx(user, "yes"), "callback_data": f"ok:{code}"},
                    {"text": tx(user, "no"), "callback_data": f"no:{code}"},
                ]]},
            })
        else:
            bot_api("sendMessage", {
                "chat_id": chat,
                "text": tx(user, "hi"),
                "reply_markup": {"inline_keyboard": [[{"text": tx(user, "open"), "web_app": {"url": APP_URL}}]]},
            })
        return
    cq = upd.get("callback_query")
    if cq and isinstance(cq.get("data"), str) and cq["data"][:3] in ("ok:", "no:"):
        user = cq.get("from", {})
        uid = str(user.get("id", ""))
        code = cq["data"][3:]
        with login_lock:
            rec = logins.get(code)
            live = rec is not None and rec["st"] == "pending" and time.time() - rec["t"] <= LOGIN_TTL
            if live and cq["data"].startswith("no:"):
                rec["st"] = "denied"
                reply = "denied"
            elif live and not allowed(uid):
                rec["st"] = "denied"
                reply = "blocked"
            elif live:
                rec["st"], rec["user"] = "ok", user
                reply = "done"
            else:
                reply = "expired"
        if reply == "blocked":
            log_event("login_blocked", uid, "web")
        bot_api("answerCallbackQuery", {"callback_query_id": cq["id"]})
        msg = cq.get("message") or {}
        if msg.get("chat"):
            bot_api("editMessageText", {"chat_id": msg["chat"]["id"], "message_id": msg["message_id"], "text": tx(user, reply)})


def bot_loop() -> None:
    """Длинный опрос getUpdates. Если у бота стоит вебхук (409) — выключаемся."""
    offset = 0
    bot_info["polling"] = "on"
    while True:
        try:
            updates = bot_api("getUpdates", {"offset": offset, "timeout": 25, "allowed_updates": ["message", "callback_query"]}, timeout=35)
        except urllib.error.HTTPError as e:
            if e.code == 409:
                bot_info["polling"] = "conflict"
                log_event("bot_conflict", d="webhook set — web login off")
                time.sleep(600)
                bot_info["polling"] = "on"
            else:
                time.sleep(10)
            continue
        except Exception:
            time.sleep(10)
            continue
        for upd in updates or []:
            offset = max(offset, upd.get("update_id", 0) + 1)
            try:
                handle_update(upd)
            except Exception:
                pass


# ───────────── Админка ─────────────

stats_cache: dict[str, tuple] = {}


def data_stats(uid: str) -> dict:
    """Только размеры и количества — содержимое записей наружу не идёт."""
    try:
        st = os.stat(user_path(uid))
    except (FileNotFoundError, ValueError):
        return {"size": 0, "records": 0, "workouts": 0, "updated": None}
    key = (st.st_mtime_ns, st.st_size)
    hit = stats_cache.get(uid)
    if hit and hit[0] == key:
        return hit[1]
    records = workouts = 0
    try:
        with open(user_path(uid), encoding="utf-8") as f:
            state = json.load(f)
        for r in state.get("records", {}).values():
            if r.get("data") is not None:
                records += 1
                if r.get("c") == "sessions":
                    workouts += 1
    except (OSError, ValueError):
        pass
    out = {"size": st.st_size, "records": records, "workouts": workouts, "updated": int(st.st_mtime)}
    stats_cache[uid] = (key, out)
    return out


def admin_overview() -> dict:
    now = int(time.time())
    events = read_events()
    days = [(date.today() - timedelta(days=i)).isoformat() for i in range(29, -1, -1)]
    daily = {d: {"visits": 0, "users": set()} for d in days}
    v7: dict[str, int] = {}
    for e in events:
        if e.get("e") != "visit":
            continue
        d = datetime.fromtimestamp(e["t"]).date().isoformat()
        if d in daily:
            daily[d]["visits"] += 1
            daily[d]["users"].add(e.get("uid"))
        if now - e["t"] <= 7 * 86400 and e.get("uid"):
            v7[e["uid"]] = v7.get(e["uid"], 0) + 1
    with meta_lock:
        sessions_by: dict[str, int] = {}
        for s in META["sessions"].values():
            sessions_by[s["uid"]] = sessions_by.get(s["uid"], 0) + 1
        users = []
        for uid, u in META["users"].items():
            users.append({
                "id": uid, "username": u.get("u", ""), "name": u.get("n", ""), "lang": u.get("lang", ""),
                "first": u.get("first"), "seen": u.get("seen"), "visits": u.get("visits", 0),
                "visits7": v7.get(uid, 0), "plat": u.get("plat", ""), "via": u.get("via", ""),
                "blocked": bool(u.get("blocked")), "admin": is_admin(uid),
                "webSessions": sessions_by.get(uid, 0), **data_stats(uid),
            })
    users.sort(key=lambda x: x.get("seen") or 0, reverse=True)
    return {
        "now": now,
        "users": users,
        "daily": [{"d": d, "visits": daily[d]["visits"], "users": len(daily[d]["users"])} for d in days],
        "bot": {"username": bot_username(), "polling": bot_info["polling"]},
    }


def admin_events(query: dict) -> dict:
    try:
        limit = max(1, min(int(query.get("limit", ["300"])[0]), 2000))
    except ValueError:
        limit = 300
    kind = query.get("type", [""])[0]
    uid = query.get("uid", [""])[0]
    out = []
    for e in reversed(read_events()):
        if kind and e.get("e") != kind:
            continue
        if uid and e.get("uid") != uid:
            continue
        out.append(e)
        if len(out) >= limit:
            break
    return {"events": out}


def admin_user(admin_uid: str, body) -> dict:
    if not isinstance(body, dict):
        raise ApiError(400, "bad request")
    uid, action = str(body.get("uid", "")), body.get("action")
    if not uid.isdigit() or uid not in META["users"]:
        raise ApiError(404, "no user")
    if uid == admin_uid and action in ("block", "delete"):
        raise ApiError(400, "self")
    if action in ("block", "unblock"):
        with meta_lock:
            META["users"][uid]["blocked"] = action == "block"
            save_meta()
        if action == "block":
            drop_sessions(uid)
    elif action == "logout":
        drop_sessions(uid)
    elif action == "delete":
        delete_account(uid)
    else:
        raise ApiError(400, "bad action")
    # После удаления id в журнале не оставляем: человек стёрт целиком.
    log_event("admin", admin_uid, d=action if action == "delete" else f"{action} {uid}")
    return {"ok": True}


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
                log_event("quota", uid)
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
    stats_cache.pop(uid, None)
    drop_sessions(uid)
    with meta_lock:
        if META["users"].pop(uid, None) is not None:
            save_meta()
    forget_events(uid)
    log_event("account_deleted")  # без id: человек отозвал согласие
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

    def _auth(self) -> dict:
        auth = self.headers.get("Authorization", "")
        ident = None
        if auth.startswith("tma "):
            user = verify_init_data(auth[4:])
            if user:
                ident = {"uid": str(user["id"]), "via": "tg", "user": user}
        elif auth.startswith("Bearer "):
            uid, sid = session_uid(auth[7:].strip())
            if uid:
                ident = {"uid": uid, "via": "web", "sid": sid}
        if not ident or (ALLOWED and ident["uid"] not in ALLOWED):
            raise ApiError(401, "unauthorized")
        if is_blocked(ident["uid"]):
            raise ApiError(403, "blocked")
        if not rate_ok(ident["uid"]):
            raise ApiError(429, "rate")
        with meta_lock:
            u = META["users"].get(ident["uid"])
            if u:
                u["seen"] = int(time.time())
                mark_dirty()
        return ident

    def _admin(self) -> dict:
        ident = self._auth()
        if not is_admin(ident["uid"]):
            raise ApiError(403, "forbidden")
        return ident

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

    def _body_or_empty(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        return self._body() if length > 0 else {}

    def do_GET(self):
        path, _, qs = self.path.partition("?")
        if path == "/api/health":
            return self._send(200, {"ok": True})
        if path == "/api/auth/config":
            return self._handle(lambda: {"bot": bot_username(), "web": bool(bot_username()) and bot_info["polling"] == "on"})
        if path == "/api/admin/overview":
            return self._handle(lambda: (self._admin(), admin_overview())[1])
        if path == "/api/admin/events":
            return self._handle(lambda: (self._admin(), admin_events(urllib.parse.parse_qs(qs)))[1])
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/api/sync":
            return self._handle(lambda: sync(self._auth()["uid"], self._body()))
        if self.path == "/api/hello":
            return self._handle(lambda: hello(self._auth(), self._body_or_empty()))
        if self.path == "/api/account/delete":
            return self._handle(lambda: delete_account(self._auth()["uid"]))
        if self.path == "/api/auth/web/start":
            return self._handle(web_login_start)
        if self.path == "/api/auth/web/poll":
            return self._handle(lambda: web_login_poll(self._body()))
        if self.path == "/api/auth/logout":
            return self._handle(lambda: logout(self._auth()))
        if self.path == "/api/admin/user":
            return self._handle(lambda: admin_user(self._admin()["uid"], self._body()))
        self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # без IP и initData в логах
        pass


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    load_meta()
    threading.Thread(target=flusher, daemon=True).start()
    if BOT_TOKEN and BOT_POLL:
        threading.Thread(target=bot_loop, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
