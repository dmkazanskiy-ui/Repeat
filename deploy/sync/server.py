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
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agent  # noqa: E402  ИИ-ассистенты: ключи, OAuth, MCP, REST
import morning  # noqa: E402  утренняя сводка из Garmin

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
    "plans", "plannedSessions", "inbox",
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
        for key in ("grants", "agent_tokens", "oauth_clients", "agent_idem", "morning"):  # доступы ИИ, утренняя сводка
            if isinstance(data.get(key), dict):
                META[key] = data[key]
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
    if body.get("platform") == "oauth":
        agent.trace("telegram_confirmed", "вход для коннектора подтверждён ботом")
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
    forget_social(uid)
    agent.forget_user(uid)
    log_event("account_deleted")  # без id: человек отозвал согласие
    return {"deleted": True}



# ───────────── Соцчасть: публичный профиль и лента (social.json, avatars/) ─────────────
#
# Всё по согласию: профиль и тренировки видны другим только после того, как
# человек сам включил «Публичный профиль» и дал отдельное согласие на
# распространение (ст. 10.1 152-ФЗ). Лента видна только вошедшим в Repeat.
# Наружу уходит обезличенный слепок тренировки, который собирает сам клиент:
# упражнения, подходы, длительность, дистанция. Без заметок, пульса, калорий,
# веса тела и самочувствия. Telegram id наружу не уходит — у профиля свой pid.

social_lock = threading.RLock()
SOCIAL: dict = {"profiles": {}, "posts": {}, "follows": {}, "photos": {}}
ACTIVITIES = {"strength", "run", "bike", "swim", "walk", "mobility", "hiit", "recovery", "crossfit", "boxing", "climb", "team"}
MAX_POSTS_PER_USER = 200
MAX_COMMENTS = 300
AVATAR_MAX = 200 * 1024
PHOTO_MAX = 1600 * 1024  # одно фото тренировки (клиент жмёт до ~1600 px)
PHOTOS_PER_USER = 300


def social_path() -> str:
    return os.path.join(DATA_DIR, "social.json")


def photo_path(pid: str) -> str:
    return os.path.join(DATA_DIR, "photos", f"{pid}.jpg")


def avatar_path(pid: str) -> str:
    return os.path.join(DATA_DIR, "avatars", f"{pid}.jpg")


def load_social() -> None:
    global SOCIAL
    try:
        with open(social_path(), encoding="utf-8") as f:
            data = json.load(f)
        SOCIAL = {"profiles": data.get("profiles", {}), "posts": data.get("posts", {}), "follows": data.get("follows", {}), "photos": data.get("photos", {})}
    except FileNotFoundError:
        pass


def save_social() -> None:
    with social_lock:
        raw = json.dumps(SOCIAL, ensure_ascii=False, separators=(",", ":")).encode()
        tmp = social_path() + ".tmp"
        with open(tmp, "wb") as f:
            f.write(raw)
        os.replace(tmp, social_path())


def profile_of(uid: str) -> dict:
    """Профиль человека; создаётся закрытым при первом обращении."""
    with social_lock:
        pr = SOCIAL["profiles"].get(uid)
        if pr is None:
            u = META["users"].get(uid, {})
            pr = {"pid": secrets.token_urlsafe(8), "public": False, "name": u.get("n") or (("@" + u["u"]) if u.get("u") else ""),
                  "bio": "", "acts": [], "av": 0, "consentAt": None}
            SOCIAL["profiles"][uid] = pr
            save_social()
        return pr


def uid_by_pid(pid: str):
    for uid, pr in SOCIAL["profiles"].items():
        if pr.get("pid") == pid:
            return uid
    return None


def visible(uid: str) -> bool:
    pr = SOCIAL["profiles"].get(uid)
    return bool(pr and pr.get("public")) and not is_blocked(uid)


def author_card(uid: str) -> dict:
    pr = SOCIAL["profiles"].get(uid, {})
    return {"pid": pr.get("pid"), "name": pr.get("name") or "Без имени", "av": pr.get("av", 0)}


def own_profile(uid: str) -> dict:
    pr = profile_of(uid)
    return {"pid": pr["pid"], "public": pr["public"], "name": pr["name"], "bio": pr["bio"], "acts": pr["acts"], "av": pr["av"]}


def set_profile(uid: str, body) -> dict:
    if not isinstance(body, dict):
        raise ApiError(400, "bad request")
    with social_lock:
        pr = profile_of(uid)
        if "name" in body:
            name = clean_text(body.get("name"), 40).strip()
            if not name:
                raise ApiError(400, "name")
            pr["name"] = name
        if "bio" in body:
            pr["bio"] = clean_text(str(body.get("bio") or "").replace("\n", " "), 200).strip()
        if "acts" in body and isinstance(body["acts"], list):
            pr["acts"] = [a for a in body["acts"] if a in ACTIVITIES][:12]
        if "public" in body:
            want = bool(body["public"])
            if want and not pr["public"]:
                if body.get("consent") is not True:
                    raise ApiError(400, "consent")
                pr["consentAt"] = int(time.time())
                log_event("social_public", uid)
            if not want and pr["public"]:
                # Закрыл профиль — убираем из ленты всё его (лайки/комменты чужим постам остаются обезличенными).
                for pid_ in [k for k, v in SOCIAL["posts"].items() if v["uid"] == uid]:
                    SOCIAL["posts"].pop(pid_, None)
                pr["consentAt"] = None
                log_event("social_private", uid)
            pr["public"] = want
        save_social()
    return own_profile(uid)


def set_avatar(uid: str, body) -> dict:
    import base64
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, str) or not data.startswith("data:image/jpeg;base64,"):
        raise ApiError(400, "bad image")
    try:
        raw = base64.b64decode(data.split(",", 1)[1], validate=True)
    except ValueError:
        raise ApiError(400, "bad image")
    if len(raw) > AVATAR_MAX or raw[:3] != b"\xff\xd8\xff":
        raise ApiError(413, "bad image")
    pr = profile_of(uid)
    os.makedirs(os.path.dirname(avatar_path(pr["pid"])), exist_ok=True)
    with open(avatar_path(pr["pid"]) + ".tmp", "wb") as f:
        f.write(raw)
    os.replace(avatar_path(pr["pid"]) + ".tmp", avatar_path(pr["pid"]))
    with social_lock:
        pr["av"] = int(time.time())
        save_social()
    return own_profile(uid)


def decode_jpeg(body, limit: int) -> bytes:
    import base64
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, str) or not data.startswith("data:image/jpeg;base64,"):
        raise ApiError(400, "bad image")
    try:
        raw = base64.b64decode(data.split(",", 1)[1], validate=True)
    except ValueError:
        raise ApiError(400, "bad image")
    if len(raw) > limit or raw[:3] != b"\xff\xd8\xff":
        raise ApiError(413, "bad image")
    return raw


def upload_photo(uid: str, body) -> dict:
    """Фото тренировки. Адрес — случайный id: видят его только те, кому показали
    (владелец и, если тренировка в ленте, другие пользователи)."""
    raw = decode_jpeg(body, PHOTO_MAX)
    num = lambda v: int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and 0 < v < 20000 else None
    w, h = num(body.get("w")), num(body.get("h"))
    with social_lock:
        if sum(1 for ph in SOCIAL["photos"].values() if ph["uid"] == uid) >= PHOTOS_PER_USER:
            raise ApiError(413, "quota")
        pid_ = secrets.token_urlsafe(16)
        os.makedirs(os.path.dirname(photo_path(pid_)), exist_ok=True)
        with open(photo_path(pid_), "wb") as f:
            f.write(raw)
        SOCIAL["photos"][pid_] = {"uid": uid, "t": int(time.time()), "w": w, "h": h}
        save_social()
    return {"id": pid_, "w": w, "h": h}


def delete_photo(uid: str, body) -> dict:
    pid_ = body.get("id") if isinstance(body, dict) else None
    with social_lock:
        ph = SOCIAL["photos"].get(pid_ or "")
        if not ph or (ph["uid"] != uid and not is_admin(uid)):
            raise ApiError(404, "no photo")
        SOCIAL["photos"].pop(pid_, None)
        save_social()
    try:
        os.remove(photo_path(pid_))
    except FileNotFoundError:
        pass
    return {"ok": True}


def serve_photo(pid_: str):
    if pid_ not in SOCIAL["photos"] or is_blocked(SOCIAL["photos"][pid_]["uid"]):
        return None
    try:
        with open(photo_path(pid_), "rb") as f:
            return f.read()
    except (FileNotFoundError, OSError):
        return None


def post_id(uid: str, sid: str) -> str:
    return hashlib.sha256(f"{uid}:{sid}".encode()).hexdigest()[:16]


def clean_snap(snap, uid: str = "") -> dict:
    """Слепок тренировки: только разрешённые поля, с ограничениями по размеру."""
    if not isinstance(snap, dict):
        raise ApiError(400, "bad post")
    num = lambda v, lo=0, hi=10**7: (v if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and lo <= v <= hi else None)
    out = {
        "kind": clean_text(snap.get("kind"), 16),
        "title": clean_text(snap.get("title"), 80),
        "icon": clean_text(snap.get("icon"), 32),
        "date": clean_text(snap.get("date"), 10),
        "time": clean_text(snap.get("time"), 5),
        "durationSec": num(snap.get("durationSec"), 0, 86400),
        "volume": num(snap.get("volume")),
        "distanceM": num(snap.get("distanceM"), 0, 10**6),
        "sets": num(snap.get("sets"), 0, 10000),
        "exercises": [],
    }
    for ex in (snap.get("exercises") or [])[:30]:
        if not isinstance(ex, dict):
            continue
        sets = []
        for st in (ex.get("sets") or [])[:30]:
            if isinstance(st, dict):
                sets.append({"w": num(st.get("w"), 0, 2000), "r": num(st.get("r"), 0, 1000), **({"wu": True} if st.get("wu") else {})})
        out["exercises"].append({"name": clean_text(ex.get("name"), 80), "sets": sets})
    out["photos"] = []
    for ph in (snap.get("photos") or [])[:10]:
        if isinstance(ph, dict) and isinstance(ph.get("id"), str):
            meta = SOCIAL["photos"].get(ph["id"])
            if meta and meta["uid"] == uid:  # чужие фото к своему посту не прицепить
                out["photos"].append({"id": ph["id"], "w": meta.get("w"), "h": meta.get("h")})
    if out["kind"] not in ("strength", "cardio", "mobility", "recovery", "wod", "hiit"):
        raise ApiError(400, "bad post")
    return out


def published(uid: str) -> dict:
    with social_lock:
        return {"posts": {p["sid"]: p["hash"] for p in SOCIAL["posts"].values() if p["uid"] == uid}}


def publish(uid: str, body) -> dict:
    if not isinstance(body, dict):
        raise ApiError(400, "bad request")
    pr = profile_of(uid)
    if not pr["public"]:
        raise ApiError(403, "private")
    upsert, remove = body.get("upsert") or [], body.get("remove") or []
    if not isinstance(upsert, list) or not isinstance(remove, list) or len(upsert) > 60 or len(remove) > 500:
        raise ApiError(400, "bad request")
    with social_lock:
        for item in upsert:
            if not isinstance(item, dict) or not isinstance(item.get("sid"), str) or len(item["sid"]) > 100:
                continue
            snap = clean_snap(item.get("snap"), uid)
            raw = json.dumps(snap, ensure_ascii=False, sort_keys=True)
            if len(raw) > 20000:
                continue
            pid_ = post_id(uid, item["sid"])
            cur = SOCIAL["posts"].get(pid_)
            SOCIAL["posts"][pid_] = {
                "uid": uid, "sid": item["sid"], "t": cur["t"] if cur else int(time.time()),
                "hash": clean_text(item.get("hash"), 64), "snap": snap,
                "likes": cur["likes"] if cur else [], "comments": cur["comments"] if cur else [],
            }
        for sid in remove:
            if isinstance(sid, str):
                SOCIAL["posts"].pop(post_id(uid, sid), None)
        mine = sorted((p for p in SOCIAL["posts"].items() if p[1]["uid"] == uid), key=lambda kv: kv[1]["t"])
        for k, _ in mine[:-MAX_POSTS_PER_USER]:
            SOCIAL["posts"].pop(k, None)
        save_social()
    return published(uid)


def post_view(pid_: str, p: dict, me: str, full: bool = False) -> dict:
    out = {
        "id": pid_, "t": p["t"], "author": author_card(p["uid"]), "mine": p["uid"] == me,
        "snap": p["snap"], "likes": len(p["likes"]), "liked": me in p["likes"],
        "comments": len([c for c in p["comments"] if visible(c["uid"]) or c["uid"] == me]),
    }
    if full:
        out["commentList"] = [
            {"id": c["id"], "t": c["t"], "text": c["text"], "author": author_card(c["uid"]), "mine": c["uid"] == me}
            for c in p["comments"] if visible(c["uid"]) or c["uid"] == me
        ]
    return out


def feed(me: str, query: dict) -> dict:
    try:
        offset = max(0, int(query.get("offset", ["0"])[0]))
    except ValueError:
        offset = 0
    only = query.get("pid", [""])[0]
    owner = uid_by_pid(only) if only else None
    with social_lock:
        items = [
            (k, p) for k, p in SOCIAL["posts"].items()
            if visible(p["uid"]) and (not only or p["uid"] == owner)
        ]
        items.sort(key=lambda kv: (kv[1]["snap"].get("date", ""), kv[1]["t"]), reverse=True)
        page = items[offset:offset + 20]
        return {"posts": [post_view(k, p, me) for k, p in page], "more": len(items) > offset + 20}


def get_post(me: str, pid_: str) -> dict:
    with social_lock:
        p = SOCIAL["posts"].get(pid_)
        if not p or not (visible(p["uid"]) or p["uid"] == me):
            raise ApiError(404, "no post")
        return post_view(pid_, p, me, full=True)


def like(me: str, body) -> dict:
    pid_ = body.get("post") if isinstance(body, dict) else None
    with social_lock:
        p = SOCIAL["posts"].get(pid_ or "")
        if not p or not visible(p["uid"]):
            raise ApiError(404, "no post")
        if body.get("on") and me not in p["likes"]:
            p["likes"].append(me)
        elif not body.get("on") and me in p["likes"]:
            p["likes"].remove(me)
        save_social()
        return {"likes": len(p["likes"]), "liked": me in p["likes"]}


def comment(me: str, body) -> dict:
    if not isinstance(body, dict):
        raise ApiError(400, "bad request")
    text = clean_text(str(body.get("text") or "").replace("\n", " "), 500).strip()
    if not text:
        raise ApiError(400, "empty")
    if not profile_of(me)["public"]:
        raise ApiError(403, "private")
    with social_lock:
        p = SOCIAL["posts"].get(body.get("post") or "")
        if not p or not visible(p["uid"]):
            raise ApiError(404, "no post")
        if len(p["comments"]) >= MAX_COMMENTS:
            raise ApiError(429, "full")
        p["comments"].append({"id": secrets.token_urlsafe(6), "uid": me, "text": text, "t": int(time.time())})
        save_social()
        return get_post(me, body["post"])


def delete_comment(me: str, body) -> dict:
    if not isinstance(body, dict):
        raise ApiError(400, "bad request")
    with social_lock:
        p = SOCIAL["posts"].get(body.get("post") or "")
        if not p:
            raise ApiError(404, "no post")
        c = next((c for c in p["comments"] if c["id"] == body.get("id")), None)
        if not c:
            raise ApiError(404, "no comment")
        if me not in (c["uid"], p["uid"]) and not is_admin(me):
            raise ApiError(403, "forbidden")
        p["comments"].remove(c)
        save_social()
        if is_admin(me) and me not in (c["uid"], p["uid"]):
            log_event("admin", me, d="delete comment")
        return get_post(me, body["post"])


def delete_post(me: str, body) -> dict:
    pid_ = body.get("post") if isinstance(body, dict) else None
    with social_lock:
        p = SOCIAL["posts"].get(pid_ or "")
        if not p:
            raise ApiError(404, "no post")
        if p["uid"] != me and not is_admin(me):
            raise ApiError(403, "forbidden")
        SOCIAL["posts"].pop(pid_, None)
        save_social()
    if p["uid"] != me:
        log_event("admin", me, d="delete post")
    return {"ok": True}


def public_profile(me: str, pid: str) -> dict:
    uid = uid_by_pid(pid)
    if not uid or not (visible(uid) or uid == me):
        raise ApiError(404, "no profile")
    pr = SOCIAL["profiles"][uid]
    with social_lock:
        posts = [p for p in SOCIAL["posts"].values() if p["uid"] == uid]
        followers = sum(1 for f, targets in SOCIAL["follows"].items() if uid in targets and not is_blocked(f))
        following = len([x for x in SOCIAL["follows"].get(uid, []) if visible(x)])
        followed = uid in SOCIAL["follows"].get(me, [])
    return {
        "followers": followers, "following": following, "followed": followed,
        "pid": pid, "name": pr.get("name") or "Без имени", "bio": pr.get("bio", ""), "acts": pr.get("acts", []),
        "av": pr.get("av", 0), "mine": uid == me, "posts": len(posts),
        "likes": sum(len(p["likes"]) for p in posts),
    }


def follow(me: str, body) -> dict:
    """Подписка на открытый профиль. Список подписчиков наружу не отдаём — только число."""
    pid = body.get("pid") if isinstance(body, dict) else None
    uid = uid_by_pid(pid) if isinstance(pid, str) else None
    if not uid or uid == me or not visible(uid):
        raise ApiError(404, "no profile")
    with social_lock:
        lst = SOCIAL["follows"].setdefault(me, [])
        if body.get("on") and uid not in lst:
            if len(lst) >= 2000:
                raise ApiError(429, "full")
            lst.append(uid)
        elif not body.get("on") and uid in lst:
            lst.remove(uid)
        save_social()
    return public_profile(me, pid)


def serve_avatar(pid: str):
    uid = uid_by_pid(pid)
    if not uid or not visible(uid):
        return None
    try:
        with open(avatar_path(pid), "rb") as f:
            return f.read()
    except FileNotFoundError:
        return None


def forget_social(uid: str) -> None:
    """Удаление аккаунта: профиль, аватар, посты, лайки и комментарии человека."""
    with social_lock:
        pr = SOCIAL["profiles"].pop(uid, None)
        for k in [k for k, p in SOCIAL["posts"].items() if p["uid"] == uid]:
            SOCIAL["posts"].pop(k, None)
        SOCIAL["follows"].pop(uid, None)
        for lst in SOCIAL["follows"].values():
            if uid in lst:
                lst.remove(uid)
        for p in SOCIAL["posts"].values():
            if uid in p["likes"]:
                p["likes"].remove(uid)
            p["comments"] = [c for c in p["comments"] if c["uid"] != uid]
        save_social()
    with social_lock:
        mine = [k for k, ph in SOCIAL["photos"].items() if ph["uid"] == uid]
        for k in mine:
            SOCIAL["photos"].pop(k, None)
        save_social()
    for k in mine:
        try:
            os.remove(photo_path(k))
        except FileNotFoundError:
            pass
    if pr:
        try:
            os.remove(avatar_path(pr["pid"]))
        except FileNotFoundError:
            pass


def morning_status(uid: str) -> dict:
    """Утренняя сводка доступна владельцу ключа Garmin (админу)."""
    mine = uid == morning.owner()
    rec = META.get("morning", {}).get(uid, {}) if mine else {}
    return {"available": mine and morning.configured(), "lastDate": rec.get("date"), "sent": rec.get("sent")}


def morning_run(uid: str) -> dict:
    if uid != morning.owner():
        raise ApiError(403, "forbidden")
    return morning.run(uid, force=True)


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

    def _raw(self, code: int, body: bytes, ctype: str = "application/json; charset=utf-8", headers=None, cors: bool = False) -> None:
        self.send_response(code)
        if body or code not in (202, 204):
            self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cors:
            self._cors()
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self) -> None:
        # ИИ-клиенты в браузере (инспекторы MCP) ходят с чужого origin; доступ — только по токену.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id")

    def _json(self, code: int, payload, headers=None, cors: bool = True) -> None:
        body = b"" if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        self._raw(code, body, headers=headers, cors=cors)

    def _raw_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "bad request")
        if length < 0 or length > MAX_BODY:
            raise ApiError(413, "bad size")
        return self.rfile.read(length) if length else b""

    def _form(self) -> dict:
        raw = self._raw_body().decode("utf-8", "replace")
        if (self.headers.get("Content-Type") or "").startswith("application/json"):
            try:
                data = json.loads(raw or "{}")
                return {k: str(v) for k, v in data.items()} if isinstance(data, dict) else {}
            except ValueError:
                return {}
        return {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}

    def _agent(self) -> dict:
        ident = agent.agent_ident(self.headers.get("Authorization", ""))
        if not ident:
            raise ApiError(401, "unauthorized")
        return ident

    def _handle_agent(self, fn) -> None:
        """Ручки для ИИ: CORS и WWW-Authenticate при 401."""
        try:
            self._json(200, fn())
        except ApiError as e:
            hdr = {"WWW-Authenticate": agent.www_authenticate()} if e.code == 401 else None
            self._json(e.code, {"error": e.error}, headers=hdr)
        except Exception:
            self._json(500, {"error": "server"})

    def do_OPTIONS(self):
        self._raw(204, b"", cors=True)

    def do_DELETE(self):
        self._json(405, {"error": "method not allowed"}, headers={"Allow": "POST"})

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
        # ── ИИ-ассистенты (agent.py) ──
        if path.startswith("/.well-known/oauth-protected-resource"):
            return self._json(200, agent.protected_resource_meta())
        if path.startswith("/.well-known/oauth-authorization-server") or path == "/.well-known/openid-configuration":
            return self._json(200, agent.auth_server_meta())
        if path == "/api/mcp":
            return self._json(405, {"error": "use POST"}, headers={"Allow": "POST"})
        if path == "/api/oauth/authorize":
            code, page = agent.authorize_page(urllib.parse.parse_qs(qs))
            return self._raw(code, page.encode(), "text/html; charset=utf-8", headers={"X-Frame-Options": "DENY"})
        if path == "/api/oauth/whoami":
            return self._handle(lambda: {"ok": bool(self._auth())})
        if path == "/api/agent/keys":
            return self._handle(lambda: agent.list_grants(self._auth()["uid"]))
        if path == "/api/morning/status":
            return self._handle(lambda: morning_status(self._auth()["uid"]))
        if path == "/api/v1/openapi.json":
            return self._json(200, agent.openapi())
        if path.startswith("/api/v1/"):
            return self._handle_agent(lambda: agent.rest_get(self._agent(), path, urllib.parse.parse_qs(qs)))
        if path == "/api/auth/config":
            return self._handle(lambda: {"bot": bot_username(), "web": bool(bot_username()) and bot_info["polling"] == "on"})
        if path.startswith("/api/social/avatar/") and path.endswith(".jpg"):
            img = serve_avatar(path[len("/api/social/avatar/"):-4])
            if img is None:
                return self._send(404, {"error": "not found"})
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Content-Length", str(len(img)))
            self.end_headers()
            self.wfile.write(img)
            return
        if path.startswith("/api/social/photo/") and path.endswith(".jpg"):
            img = serve_photo(path[len("/api/social/photo/"):-4])
            if img is None:
                return self._send(404, {"error": "not found"})
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "private, max-age=604800, immutable")
            self.send_header("Content-Length", str(len(img)))
            self.end_headers()
            self.wfile.write(img)
            return
        if path == "/api/social/me":
            return self._handle(lambda: own_profile(self._auth()["uid"]))
        if path == "/api/social/published":
            return self._handle(lambda: published(self._auth()["uid"]))
        if path == "/api/social/feed":
            return self._handle(lambda: feed(self._auth()["uid"], urllib.parse.parse_qs(qs)))
        if path.startswith("/api/social/post/"):
            return self._handle(lambda: get_post(self._auth()["uid"], path[len("/api/social/post/"):]))
        if path.startswith("/api/social/profile/"):
            return self._handle(lambda: public_profile(self._auth()["uid"], path[len("/api/social/profile/"):]))
        if path == "/api/admin/overview":
            return self._handle(lambda: (self._admin(), admin_overview())[1])
        if path == "/api/admin/events":
            return self._handle(lambda: (self._admin(), admin_events(urllib.parse.parse_qs(qs)))[1])
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.partition("?")[0]
        # ── ИИ-ассистенты (agent.py) ──
        if path == "/api/mcp":
            try:
                raw = self._raw_body()
                try:
                    body = json.loads(raw) if raw else None
                except (ValueError, RecursionError):
                    return self._json(400, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                code, hdr, payload = agent.handle_mcp(self.headers.get("Authorization", ""), body)
                return self._json(code, payload, headers=hdr)
            except ApiError as e:
                return self._json(e.code, {"error": e.error})
            except Exception:
                return self._json(500, {"error": "server"})
        if path == "/api/oauth/register":
            try:
                code, out = agent.register_client(self._body())
            except ApiError as e:
                code, out = e.code, {"error": e.error}
            return self._json(code, out)
        if path == "/api/oauth/token":
            try:
                code, out = agent.token(self._form(), self.headers.get("Authorization", ""))
            except ApiError as e:
                code, out = e.code, {"error": e.error}
            return self._json(code, out)
        if path == "/api/oauth/revoke":
            try:
                code, out = agent.revoke_token(self._form())
            except ApiError as e:
                code, out = e.code, {"error": e.error}
            return self._json(code, out)
        if path == "/api/oauth/approve":
            return self._handle(lambda: agent.approve(self._auth()["uid"], self._body()))
        if path == "/api/agent/keys":
            return self._handle(lambda: agent.create_key(self._auth()["uid"], self._body_or_empty()))
        if path == "/api/morning/run":
            return self._handle(lambda: morning_run(self._auth()["uid"]))
        if path == "/api/agent/keys/revoke":
            return self._handle(lambda: agent.revoke(self._auth()["uid"], self._body()))
        if path.startswith("/api/v1/"):
            return self._handle_agent(lambda: agent.rest_post(self._agent(), path, self._body()))
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
        social_routes = {
            "/api/social/profile": set_profile, "/api/social/avatar": set_avatar, "/api/social/publish": publish,
            "/api/social/like": like, "/api/social/comment": comment, "/api/social/comment/delete": delete_comment,
            "/api/social/post/delete": delete_post, "/api/social/follow": follow,
            "/api/social/photo": upload_photo, "/api/social/photo/delete": delete_photo,
        }
        if self.path in social_routes:
            fn = social_routes[self.path]
            return self._handle(lambda: fn(self._auth()["uid"], self._body()))
        if self.path == "/api/admin/user":
            return self._handle(lambda: admin_user(self._admin()["uid"], self._body()))
        self._send(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # без IP и initData в логах
        pass


agent.bind(sys.modules[__name__])
morning.bind(sys.modules[__name__], agent)

if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    load_meta()
    load_social()
    threading.Thread(target=flusher, daemon=True).start()
    if BOT_TOKEN and BOT_POLL:
        threading.Thread(target=bot_loop, daemon=True).start()
    if morning.configured():
        threading.Thread(target=morning.loop, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
