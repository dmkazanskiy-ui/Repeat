"""
Repeat для ИИ-ассистентов: ключи доступа, OAuth для коннекторов, MCP и REST.

Зачем: чтобы Claude, ChatGPT и другие ИИ могли читать тренировки человека и
присылать ему план или записи тренировок. Три входа, одна модель:

  • MCP (Streamable HTTP, JSON-ответы) — POST /api/mcp. Коннекторы claude.ai и
    ChatGPT входят через OAuth 2.1 (PKCE, динамическая регистрация клиента),
    человек логинится через Telegram-бота и разрешает доступ. Claude Code,
    Cursor и т. п. — по личному ключу API (Authorization: Bearer rpk_…).
  • REST /api/v1/* — то же для «действий» GPT и скриптов (тот же ключ).
  • Управление ключами из приложения — /api/agent/* (обычный вход Repeat).

Безопасность:
  • Все токены хранятся только как sha256 (meta.json → grants / agent_tokens).
  • ИИ ничего не пишет в данные напрямую: план и тренировки ложатся записью в
    коллекцию `inbox`, приложение показывает предпросмотр и импортирует только
    после подтверждения человека. Так же исключены тихие правки и удаления.
  • Права: read — читать; write — ещё и присылать во «входящие».
  • Наружу не уходят заметки, самочувствие, фото и Telegram id.

Модуль подключается из server.py через bind(server) — общие META, lock,
load_state/save_state и журнал событий берутся оттуда.
"""
import base64
import hashlib
import html
import json
import os
import re
import secrets
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

srv = None  # модуль server, см. bind()


def bind(module) -> None:
    global srv
    srv = module


ACCESS_TTL = 7 * 24 * 3600
REFRESH_TTL = 90 * 24 * 3600
CODE_TTL = 600
MAX_GRANTS = 20
MAX_INBOX = 20
MAX_PAYLOAD = 400 * 1024
MAX_CLIENTS = 5000
SCOPES = ("read", "write")
PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
FORMAT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai_format.md")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

def trace(step: str, detail: str = "") -> None:
    """Шаги OAuth/MCP в журнал сервиса (journalctl -u repeat-sync) и в журнал админки. Без токенов и кодов."""
    try:
        import sys

        print(json.dumps({"t": int(time.time()), "oauth": step, "d": str(detail)[:120]}, ensure_ascii=False), file=sys.stderr, flush=True)
        srv.log_event("oauth_" + step, None, "", str(detail)[:120])
    except Exception:
        pass


codes: dict = {}  # одноразовые коды OAuth: code → {...}, живут 10 минут в памяти


def base_url() -> str:
    u = urllib.parse.urlsplit(srv.APP_URL)
    return f"{u.scheme}://{u.netloc}"


def resource_url() -> str:
    return base_url() + "/api/mcp"


# ───────────── Хранилище доступов ─────────────
#
# META["grants"][gid] = {uid, kind: key|oauth, name, scope, created, used, client?}
# META["agent_tokens"][sha256] = {gid, type: access|refresh, exp: ts|None}
# META["oauth_clients"][client_id] = {name, redirect_uris, secret?: sha256, created}


def _m(key: str) -> dict:
    return srv.META.setdefault(key, {})


def _now() -> int:
    return int(time.time())


def _scope_of(raw) -> str:
    parts = set(str(raw or "").split())
    return "write" if "write" in parts else "read"


def _new_token(prefix: str, gid: str, kind: str, ttl) -> str:
    token = prefix + secrets.token_urlsafe(32)
    _m("agent_tokens")[srv.token_hash(token)] = {"gid": gid, "type": kind, "exp": (_now() + ttl) if ttl else None}
    return token


def _grant_view(gid: str, g: dict) -> dict:
    return {"id": gid, "kind": g["kind"], "name": g["name"], "scope": g["scope"], "created": g["created"], "used": g.get("used")}


def list_grants(uid: str) -> dict:
    with srv.meta_lock:
        mine = [(gid, g) for gid, g in _m("grants").items() if g.get("uid") == uid]
    mine.sort(key=lambda x: -x[1]["created"])
    return {"grants": [_grant_view(gid, g) for gid, g in mine]}


def create_key(uid: str, body) -> dict:
    body = body if isinstance(body, dict) else {}
    name = srv.clean_text(body.get("name"), 40).strip() or "API"
    scope = "write" if body.get("scope") == "write" else "read"
    with srv.meta_lock:
        if sum(1 for g in _m("grants").values() if g.get("uid") == uid) >= MAX_GRANTS:
            raise srv.ApiError(429, "too many keys")
        gid = secrets.token_hex(6)
        g = {"uid": uid, "kind": "key", "name": name, "scope": scope, "created": _now(), "used": None}
        _m("grants")[gid] = g
        token = _new_token("rpk_", gid, "access", None)
        srv.save_meta()
    srv.log_event("agent_key", uid, scope, name)
    return {"token": token, "grant": _grant_view(gid, g)}


def revoke(uid: str, body) -> dict:
    gid = body.get("id") if isinstance(body, dict) else None
    with srv.meta_lock:
        g = _m("grants").get(gid)
        if not g or g.get("uid") != uid:
            raise srv.ApiError(404, "not found")
        _drop_grant(gid)
        srv.save_meta()
    srv.log_event("agent_revoke", uid, g["kind"], g["name"])
    return {"ok": True}


def _drop_grant(gid: str) -> None:
    _m("grants").pop(gid, None)
    toks = _m("agent_tokens")
    for h in [h for h, t in toks.items() if t.get("gid") == gid]:
        toks.pop(h, None)


def forget_user(uid: str) -> None:
    """Удаление аккаунта: все ключи и коннекторы человека."""
    with srv.meta_lock:
        for gid in [gid for gid, g in _m("grants").items() if g.get("uid") == uid]:
            _drop_grant(gid)
        srv.save_meta()


def agent_ident(auth_header: str):
    """Bearer rpk_/rpa_ → {uid, scope, gid, name} или None."""
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    if not token.startswith(("rpk_", "rpa_")) or len(token) > 200:
        return None
    h = srv.token_hash(token)
    with srv.meta_lock:
        t = _m("agent_tokens").get(h)
        if not t or t.get("type") != "access":
            return None
        if t.get("exp") and t["exp"] < _now():
            _m("agent_tokens").pop(h, None)
            srv.mark_dirty()
            return None
        g = _m("grants").get(t["gid"])
        if not g:
            return None
        g["used"] = _now()
        srv.mark_dirty()
        ident = {"uid": g["uid"], "scope": g["scope"], "gid": t["gid"], "name": g["name"]}
    if srv.ALLOWED and ident["uid"] not in srv.ALLOWED:
        return None
    if srv.is_blocked(ident["uid"]):
        raise srv.ApiError(403, "blocked")
    if not srv.rate_ok(ident["uid"]):
        raise srv.ApiError(429, "rate")
    return ident


# ───────────── Данные человека: чтение ─────────────


def _records(uid: str) -> dict:
    with srv.lock:
        state = srv.load_state(uid) or {"records": {}}
    out: dict = {}
    for r in state["records"].values():
        if r.get("data") is not None:
            out.setdefault(r["c"], []).append(r["data"])
    return out


def _ex_names(recs: dict) -> dict:
    names = {}
    for e in recs.get("customExercises", []):
        if isinstance(e, dict) and e.get("id"):
            names[e["id"]] = e.get("name") or "?"
    return names


def _ex_name(eid: str, names: dict) -> str:
    if eid in names:
        return names[eid]
    return eid[5:] if isinstance(eid, str) and eid.startswith("base:") else "?"


def _duration_min(s: dict):
    c = s.get("cardio") or {}
    if c.get("durationSec"):
        return round(c["durationSec"] / 60)
    r = s.get("recovery") or {}
    if r.get("durationMin"):
        return r["durationMin"]
    try:
        a = datetime.fromisoformat(s["startedAt"].replace("Z", "+00:00"))
        b = datetime.fromisoformat(s["endedAt"].replace("Z", "+00:00"))
        return max(0, round(((b - a).total_seconds() - (s.get("pausedMs") or 0) / 1000) / 60))
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def _workout_view(s: dict, names: dict) -> dict:
    """Тренировка для ИИ: без заметок, самочувствия, фото и дел."""
    v = {"id": s.get("id"), "date": s.get("date"), "time": s.get("time"), "kind": s.get("kind")}
    if s.get("title"):
        v["title"] = s["title"]
    if s.get("cardioKind"):
        v["cardioKind"] = s["cardioKind"]
    if s.get("mobilityKind"):
        v["mobilityKind"] = s["mobilityKind"]
    if s.get("customKind"):
        v["customKind"] = s["customKind"]
    if (s.get("recovery") or {}).get("type"):
        v["recoveryType"] = s["recovery"]["type"]
    v["done"] = bool(s.get("endedAt"))
    d = _duration_min(s)
    if d is not None:
        v["durationMin"] = d
    c = s.get("cardio") or {}
    if c.get("distanceM"):
        v["distanceKm"] = round(c["distanceM"] / 1000, 2)
    hr = c.get("avgHr") or s.get("avgHr")
    if hr:
        v["avgHr"] = hr
    if c.get("inclineDeg") is not None:
        v["inclineDeg"] = c["inclineDeg"]
    if s.get("calories"):
        v["calories"] = s["calories"]
    if s.get("plannedSessionId"):
        v["plannedSessionId"] = s["plannedSessionId"]
    exs = []
    for e in s.get("exercises") or []:
        sets = []
        for x in e.get("sets") or []:
            row = {"weightKg": x.get("weight"), "reps": x.get("reps")}
            if x.get("warmup"):
                row["warmup"] = True
            if not x.get("done"):
                row["done"] = False
            sets.append(row)
        exs.append({"exercise": _ex_name(e.get("exerciseId"), names), "sets": sets})
    if exs:
        v["exercises"] = exs
    return v


def _today_for(recs: dict) -> str:
    tz = None
    for p in recs.get("plans", []):
        if isinstance(p, dict) and p.get("timezone") and not p.get("archivedAt"):
            tz = p["timezone"]
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(tz)).date().isoformat() if tz else datetime.now(timezone.utc).date().isoformat()
    except Exception:  # нет базы часовых поясов — UTC
        return datetime.now(timezone.utc).date().isoformat()


def _shift(day: str, n: int) -> str:
    return (datetime.fromisoformat(day) + timedelta(days=n)).date().isoformat()


def _range(args: dict, default_back: int, default_fwd: int, today: str):
    a = args.get("from") if isinstance(args.get("from"), str) and DATE_RE.match(args["from"]) else _shift(today, -default_back)
    b = args.get("to") if isinstance(args.get("to"), str) and DATE_RE.match(args["to"]) else _shift(today, default_fwd)
    if (datetime.fromisoformat(b) - datetime.fromisoformat(a)).days > 400:
        b = _shift(a, 400)
    return a, b


def _program_view(p: dict, names: dict) -> dict:
    ws = []
    for w in sorted(p.get("workouts") or [], key=lambda w: w.get("order", 0)):
        ws.append({
            "name": w.get("name"),
            "exercises": [
                {k: v for k, v in {
                    "exercise": _ex_name(e.get("exerciseId"), names),
                    "sets": e.get("targetSets"),
                    "repMin": e.get("targetRepMin"),
                    "repMax": e.get("targetRepMax"),
                    "weightKg": e.get("targetWeight"),
                    "note": e.get("note"),
                }.items() if v is not None}
                for e in sorted(w.get("exercises") or [], key=lambda e: e.get("order", 0))
            ],
        })
    out = {"name": p.get("name"), "workouts": ws}
    if p.get("progression"):
        out["progression"] = p["progression"]
    return out


PLANNED_KEYS = ("id", "date", "slot", "time", "kind", "title", "group", "optional", "cardioKind", "recoveryType",
                "mobilityKind", "durationMin", "durationMaxMin", "distanceKm", "hrMin", "hrMax", "hrZone",
                "cadenceMin", "cadenceMax", "inclineDeg", "inclineMaxDeg", "note", "status", "linkedSessionId")


def plan_view(uid: str, args: dict) -> dict:
    recs = _records(uid)
    today = _today_for(recs)
    a, b = _range(args, 7, 28, today)
    live = {p["id"]: p for p in recs.get("plans", []) if isinstance(p, dict) and not p.get("archivedAt")}
    cards = [
        {k: c[k] for k in PLANNED_KEYS if c.get(k) not in (None, False)}
        for c in recs.get("plannedSessions", [])
        if isinstance(c, dict) and c.get("planId") in live and a <= c.get("date", "") <= b
    ]
    cards.sort(key=lambda c: (c["date"], ["morning", "day", "evening"].index(c.get("slot", "day")) if c.get("slot") in ("morning", "day", "evening") else 1, c.get("time") or ""))
    plans = [{k: p.get(k) for k in ("id", "name", "start", "end", "goal", "timezone", "rules")} for p in live.values()]
    return {"today": today, "from": a, "to": b, "plans": plans, "cards": cards}


def workouts_view(uid: str, args: dict) -> dict:
    recs = _records(uid)
    today = _today_for(recs)
    a, b = _range(args, 14, 0, today)
    kind = args.get("kind") if args.get("kind") in ("strength", "cardio", "mobility", "recovery", "wod") else None
    names = _ex_names(recs)
    items = [
        _workout_view(s, names)
        for s in recs.get("sessions", [])
        if isinstance(s, dict) and a <= s.get("date", "") <= b and (not kind or s.get("kind") == kind)
    ]
    items.sort(key=lambda s: (s["date"] or "", s.get("time") or ""))
    return {"today": today, "from": a, "to": b, "workouts": items[-300:]}


def context_view(uid: str) -> dict:
    """Сводка для начала разговора: программа, план недели, последние тренировки, рабочие веса."""
    recs = _records(uid)
    today = _today_for(recs)
    names = _ex_names(recs)
    sessions = [s for s in recs.get("sessions", []) if isinstance(s, dict)]
    sessions.sort(key=lambda s: (s.get("date") or "", s.get("time") or ""))
    # Последний рабочий (не разминочный) вес по упражнению за 90 дней.
    since = _shift(today, -90)
    weights: dict = {}
    for s in sessions:
        if s.get("kind") != "strength" or (s.get("date") or "") < since:
            continue
        for e in s.get("exercises") or []:
            ws = [x.get("weight") for x in e.get("sets") or [] if not x.get("warmup") and isinstance(x.get("weight"), (int, float))]
            if ws:
                weights[_ex_name(e.get("exerciseId"), names)] = {"weightKg": max(ws), "date": s.get("date")}
    body = sorted(
        (b for b in recs.get("bodyEntries", []) if isinstance(b, dict) and b.get("weightKg")),
        key=lambda b: b.get("date") or "",
    )
    plan = plan_view(uid, {"from": today, "to": _shift(today, 6)})
    return {
        "today": today,
        "note": "Записывать в Repeat — инструментами submit_plan / submit_workouts; формат — get_format. "
                "Присланное попадает во «входящие» и записывается после подтверждения человеком.",
        "programs": [_program_view(p, names) for p in recs.get("programs", []) if isinstance(p, dict) and not p.get("archivedAt")],
        "plan": plan,
        "recentWorkouts": [_workout_view(s, names) for s in sessions if (s.get("date") or "") >= _shift(today, -14)][-40:],
        "lastWorkingWeights": weights,
        "bodyWeight": [{"date": b["date"], "kg": b["weightKg"]} for b in body[-5:]],
        "customExercises": sorted(names.values()),
    }


def format_doc() -> str:
    try:
        with open(FORMAT_PATH, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return "Формат описан в репозитории Repeat: deploy/sync/ai_format.md"


# ───────────── Запись: во «входящие» ─────────────

KINDS = {"strength", "cardio", "mobility", "recovery"}


def _as_obj(v):
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return None
    return v if isinstance(v, dict) else None


def validate(kind: str, doc) -> list:
    """Короткая проверка, чтобы ИИ сразу увидел ошибку. Полный разбор — в приложении."""
    errs = []
    if not isinstance(doc, dict):
        return ["нужен JSON-объект"]
    if kind == "plan":
        if doc.get("format") != "repeat-plan":
            errs.append('format должен быть "repeat-plan"')
        if not isinstance(doc.get("name"), str) or not doc["name"].strip():
            errs.append("нет name")
        if not (isinstance(doc.get("start"), str) and DATE_RE.match(doc["start"])):
            errs.append("start — дата YYYY-MM-DD")
        days = doc.get("days")
        if not isinstance(days, list) or not days:
            errs.append("days — непустой список")
            days = []
        if len(days) > 400:
            errs.append("больше 400 дней")
        workouts = ((doc.get("program") or {}).get("workouts") or {}) if isinstance(doc.get("program"), dict) else {}
        for i, d in enumerate(days[:400]):
            if not isinstance(d, dict) or not (isinstance(d.get("date"), str) and DATE_RE.match(d["date"])):
                errs.append(f"days[{i}].date — дата YYYY-MM-DD")
                continue
            for j, s in enumerate(d.get("sessions") or []):
                if not isinstance(s, dict):
                    errs.append(f"{d['date']}: sessions[{j}] не объект")
                    continue
                if s.get("kind") not in KINDS and not s.get("items"):
                    errs.append(f"{d['date']}: kind должен быть strength/cardio/mobility/recovery")
                if s.get("programWorkout") and s["programWorkout"] not in workouts:
                    errs.append(f"{d['date']}: programWorkout «{s['programWorkout']}» нет в program.workouts")
    else:
        if doc.get("format") != "repeat-workout":
            errs.append('format должен быть "repeat-workout"')
        ws = doc.get("workouts")
        if not isinstance(ws, list) or not ws:
            errs.append("workouts — непустой список")
            ws = []
        if len(ws) > 300:
            errs.append("больше 300 тренировок")
        for i, w in enumerate(ws[:300]):
            if not isinstance(w, dict):
                errs.append(f"workouts[{i}] не объект")
                continue
            if not (isinstance(w.get("date"), str) and DATE_RE.match(w["date"])):
                errs.append(f"workouts[{i}].date — дата YYYY-MM-DD")
            if w.get("kind") not in KINDS:
                errs.append(f"workouts[{i}].kind должен быть strength/cardio/mobility/recovery")
    return errs[:20]


def submit(ident: dict, kind: str, doc, note=None) -> dict:
    """Положить план/тренировки во «входящие» человека."""
    if ident.get("scope") != "write":
        raise srv.ApiError(403, "read-only key")
    if kind == "workout" and isinstance(doc, list):
        doc = {"format": "repeat-workout", "version": 1, "workouts": doc}
    doc = _as_obj(doc)
    errs = validate(kind, doc)
    if errs:
        return {"ok": False, "errors": errs}
    raw = json.dumps(doc, ensure_ascii=False)
    if len(raw.encode()) > MAX_PAYLOAD:
        return {"ok": False, "errors": ["слишком большой документ (больше 400 КБ)"]}
    uid = ident["uid"]
    item_id = "in_" + secrets.token_hex(8)
    item = {
        "id": item_id,
        "type": kind,
        "payload": doc,
        "source": srv.clean_text(ident.get("name"), 40) or "ИИ",
        "note": srv.clean_text(note, 300) or None,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    with srv.lock:
        state = srv.load_state(uid)
        if state is None:
            state = {"epoch": secrets.token_hex(8), "rev": 0, "records": {}}
        pending = [r for r in state["records"].values() if r["c"] == "inbox" and r.get("data") is not None]
        if len(pending) >= MAX_INBOX:
            return {"ok": False, "errors": ["во «входящих» уже 20 неразобранных — попроси человека открыть Repeat"]}
        state["rev"] += 1
        state["records"][f"inbox\u0000{item_id}"] = {"c": "inbox", "id": item_id, "ts": int(time.time() * 1000), "rev": state["rev"], "data": item}
        raw_state = json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode()
        if len(raw_state) > srv.QUOTA_BYTES:
            raise srv.ApiError(413, "quota")
        srv.save_state(uid, state, raw_state)
    srv.log_event("agent_submit", uid, kind, item["source"])
    return {
        "ok": True,
        "inboxId": item_id,
        "message": "Отправлено в Repeat. Человек увидит предпросмотр при следующем открытии приложения и подтвердит импорт.",
    }


# ───────────── MCP ─────────────

TOOLS = [
    {
        "name": "get_context",
        "title": "Сводка Repeat",
        "description": "Сводка тренировок пользователя: сегодняшняя дата, активные программы, план на 7 дней, тренировки за 2 недели, последние рабочие веса, вес тела. Начинай с этого.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "list_workouts",
        "title": "Тренировки за период",
        "description": "Тренировки за период (по умолчанию 14 дней): вид, длительность, дистанция, пульс, упражнения с подходами.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "from": {"type": "string", "description": "YYYY-MM-DD"},
                "to": {"type": "string", "description": "YYYY-MM-DD"},
                "kind": {"type": "string", "enum": ["strength", "cardio", "mobility", "recovery", "wod"]},
            },
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "get_plan",
        "title": "План по датам",
        "description": "Карточки плана (утро/день/вечер) со статусами planned/done/skipped/replaced. По умолчанию неделя назад и 4 недели вперёд.",
        "inputSchema": {
            "type": "object",
            "properties": {"from": {"type": "string"}, "to": {"type": "string"}},
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "get_format",
        "title": "Формат плана и тренировок",
        "description": "Описание JSON-форматов repeat-plan и repeat-workout с примерами. Прочитай перед submit_plan / submit_workouts.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True},
    },
    {
        "name": "submit_plan",
        "title": "Прислать план",
        "description": "Отправить план тренировок (формат repeat-plan, см. get_format) во «входящие» Repeat. Человек подтверждает импорт в приложении; ничего не удаляется, повторная отправка не создаёт дублей.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "plan": {"type": "object", "description": "Документ repeat-plan версии 1"},
                "note": {"type": "string", "description": "Короткое пояснение для человека"},
            },
            "required": ["plan"],
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True},
    },
    {
        "name": "submit_workouts",
        "title": "Записать тренировки",
        "description": "Отправить сделанные (done: true) или будущие тренировки (формат repeat-workout) во «входящие» Repeat. Сделанная тренировка закроет карточку плана того же дня.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "workouts": {"type": "array", "items": {"type": "object"}, "description": "Список тренировок repeat-workout"},
                "note": {"type": "string"},
            },
            "required": ["workouts"],
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False},
    },
]

INSTRUCTIONS = (
    "Repeat — трекер тренировок пользователя. Начни с get_context. Чтобы составить план или записать "
    "тренировку, прочитай get_format и вызови submit_plan / submit_workouts: всё попадает во «входящие» "
    "и записывается после подтверждения человеком в приложении. Упражнения называй по-русски, как в каталоге."
)


def _text(obj) -> dict:
    return {"content": [{"type": "text", "text": obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)}]}


def call_tool(ident: dict, name: str, args: dict) -> dict:
    args = args if isinstance(args, dict) else {}
    uid = ident["uid"]
    if name == "get_context":
        return _text(context_view(uid))
    if name == "list_workouts":
        return _text(workouts_view(uid, args))
    if name == "get_plan":
        return _text(plan_view(uid, args))
    if name == "get_format":
        return _text(format_doc())
    if name in ("submit_plan", "submit_workouts"):
        if ident.get("scope") != "write":
            return {**_text("Доступ только на чтение: попроси пользователя выдать доступ с записью."), "isError": True}
        res = submit(ident, "plan" if name == "submit_plan" else "workout",
                     args.get("plan") if name == "submit_plan" else args.get("workouts"), args.get("note"))
        out = _text(res)
        if not res.get("ok"):
            out["isError"] = True
        return out
    raise KeyError(name)


def mcp_message(ident: dict, msg):
    """Один JSON-RPC запрос → ответ (None для уведомлений)."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}}
    mid = msg.get("id")
    method = msg.get("method")
    if mid is None:  # уведомление (initialized, cancelled…) — ответа нет
        return None
    params = msg.get("params") if isinstance(msg.get("params"), dict) else {}
    try:
        if method == "initialize":
            asked = params.get("protocolVersion")
            result = {
                "protocolVersion": asked if asked in PROTOCOLS else PROTOCOLS[0],
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "repeat", "title": "Repeat", "version": "1.0.0"},
                "instructions": INSTRUCTIONS,
            }
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            tools = TOOLS if ident.get("scope") == "write" else [t for t in TOOLS if t["annotations"].get("readOnlyHint")]
            result = {"tools": tools}
        elif method == "tools/call":
            try:
                result = call_tool(ident, params.get("name"), params.get("arguments") or {})
            except KeyError:
                return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32602, "message": f"Unknown tool: {params.get('name')}"}}
        elif method in ("resources/list", "prompts/list"):
            result = {method.split("/")[0]: []}
        else:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": "Method not found"}}
    except srv.ApiError as e:
        result = {**_text(f"Ошибка: {e.error}"), "isError": True}
    return {"jsonrpc": "2.0", "id": mid, "result": result}


def www_authenticate() -> str:
    return f'Bearer resource_metadata="{base_url()}/.well-known/oauth-protected-resource"'


def handle_mcp(auth_header: str, body):
    """→ (status, extra_headers, payload|None)."""
    ident = agent_ident(auth_header)
    if not ident:
        trace("mcp_401", "с токеном" if auth_header.startswith("Bearer ") else "без токена")
        return 401, {"WWW-Authenticate": www_authenticate()}, {"error": "unauthorized"}
    if isinstance(body, dict) and body.get("method") == "initialize":
        trace("mcp_initialize", ident["name"])
    if isinstance(body, list):
        out = [r for r in (mcp_message(ident, m) for m in body) if r is not None]
        return (200, {}, out) if out else (202, {}, None)
    res = mcp_message(ident, body)
    return (200, {}, res) if res is not None else (202, {}, None)


# ───────────── OAuth 2.1 для коннекторов ─────────────


def protected_resource_meta() -> dict:
    return {
        "resource": resource_url(),
        "authorization_servers": [base_url()],
        "scopes_supported": list(SCOPES),
        "bearer_methods_supported": ["header"],
        "resource_name": "Repeat",
    }


def auth_server_meta() -> dict:
    b = base_url()
    return {
        "issuer": b,
        "authorization_endpoint": b + "/api/oauth/authorize",
        "token_endpoint": b + "/api/oauth/token",
        "registration_endpoint": b + "/api/oauth/register",
        "revocation_endpoint": b + "/api/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
        "scopes_supported": list(SCOPES),
        "service_documentation": b + "/",
    }


def _redirect_ok(uri) -> bool:
    if not isinstance(uri, str) or len(uri) > 500:
        return False
    u = urllib.parse.urlsplit(uri)
    if u.fragment:
        return False
    if u.scheme == "https" and u.netloc:
        return True
    if u.scheme == "http" and (u.hostname in ("localhost", "127.0.0.1", "::1")):
        return True
    # Приложения на устройстве (cursor://, vscode://…), кроме опасных схем.
    return bool(re.match(r"^[a-z][a-z0-9+.-]{2,}$", u.scheme or "")) and u.scheme not in ("javascript", "data", "file", "vbscript", "http")


def register_client(body) -> tuple:
    if not isinstance(body, dict):
        return 400, {"error": "invalid_client_metadata"}
    uris = body.get("redirect_uris")
    if not isinstance(uris, list) or not uris or len(uris) > 10 or not all(_redirect_ok(u) for u in uris):
        trace("register_bad_redirect", str(uris)[:120])
        return 400, {"error": "invalid_redirect_uri"}
    method = body.get("token_endpoint_auth_method") or "none"
    if method not in ("none", "client_secret_post", "client_secret_basic"):
        method = "none"
    name = srv.clean_text(body.get("client_name"), 60).strip() or "ИИ-ассистент"
    client_id = "rpc_" + secrets.token_urlsafe(16)
    rec = {"name": name, "redirect_uris": uris, "created": _now(), "auth": method}
    out = {
        "client_id": client_id,
        "client_id_issued_at": rec["created"],
        "client_name": name,
        "redirect_uris": uris,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": method,
    }
    if method != "none":
        secret = secrets.token_urlsafe(32)
        rec["secret"] = srv.token_hash(secret)
        out["client_secret"] = secret
        out["client_secret_expires_at"] = 0
    with srv.meta_lock:
        clients = _m("oauth_clients")
        if len(clients) >= MAX_CLIENTS:  # выкидываем самых старых без доступов
            used = {g.get("client") for g in _m("grants").values()}
            for cid in sorted((c for c in clients if c not in used), key=lambda c: clients[c]["created"])[:500]:
                clients.pop(cid, None)
        clients[client_id] = rec
        srv.save_meta()
    trace("register", f"{name} {method} {uris[0]}")
    return 201, out


def _client(cid):
    with srv.meta_lock:
        return _m("oauth_clients").get(cid) if isinstance(cid, str) else None


def check_authorize(q: dict):
    """Проверка параметров /authorize. → (client, params) или (None, ошибка)."""
    p = {k: (v[0] if isinstance(v, list) else v) for k, v in q.items()}
    client = _client(p.get("client_id"))
    if not client:
        return None, "Неизвестное приложение (client_id). Переподключи коннектор."
    if p.get("redirect_uri") not in client["redirect_uris"]:
        return None, "Адрес возврата не совпадает с зарегистрированным."
    if p.get("response_type") != "code":
        return None, "Поддерживается только response_type=code."
    if p.get("code_challenge_method") != "S256" or not p.get("code_challenge"):
        return None, "Нужен PKCE (S256)."
    return client, p


def approve(uid: str, body) -> dict:
    """Человек вошёл и разрешил доступ → одноразовый код и адрес возврата."""
    body = body if isinstance(body, dict) else {}
    client, p = check_authorize({k: body.get(k) for k in ("client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource")})
    if not client:
        trace("approve_bad", p)
        raise srv.ApiError(400, p)
    sep = "&" if "?" in p["redirect_uri"] else "?"
    if body.get("deny"):
        trace("approve_denied", client["name"])
        q = {"error": "access_denied"}
        if p.get("state"):
            q["state"] = p["state"]
        return {"redirect": p["redirect_uri"] + sep + urllib.parse.urlencode(q)}
    scope = "write" if body.get("write") else "read"
    code = secrets.token_urlsafe(24)
    now = time.time()
    for c in [c for c, v in codes.items() if now - v["t"] > CODE_TTL]:
        codes.pop(c, None)
    if len(codes) > 5000:
        raise srv.ApiError(429, "rate")
    codes[code] = {"t": now, "uid": uid, "client": p["client_id"], "redirect": p["redirect_uri"], "challenge": p["code_challenge"], "scope": scope}
    q = {"code": code}
    if p.get("state"):
        q["state"] = p["state"]
    srv.log_event("agent_oauth", uid, scope, client["name"])
    trace("approve_code", f"{client['name']} {scope} → {urllib.parse.urlsplit(p['redirect_uri']).netloc}")
    return {"redirect": p["redirect_uri"] + sep + urllib.parse.urlencode(q)}


def _client_auth(form: dict, basic: str):
    cid, secret = form.get("client_id"), form.get("client_secret")
    if basic.startswith("Basic "):
        try:
            raw = base64.b64decode(basic[6:]).decode()
            cid, _, secret = raw.partition(":")
            cid, secret = urllib.parse.unquote(cid), urllib.parse.unquote(secret)
        except (ValueError, UnicodeDecodeError):
            return None, None
    client = _client(cid)
    if not client:
        return None, None
    if client.get("secret") and (not secret or srv.token_hash(secret) != client["secret"]):
        return None, None
    return cid, client


def _issue(gid: str, scope: str) -> dict:
    access = _new_token("rpa_", gid, "access", ACCESS_TTL)
    refresh = _new_token("rpr_", gid, "refresh", REFRESH_TTL)
    return {"access_token": access, "token_type": "Bearer", "expires_in": ACCESS_TTL, "refresh_token": refresh, "scope": scope}


def token(form: dict, basic: str) -> tuple:
    cid, client = _client_auth(form, basic)
    gt = form.get("grant_type")
    if not client:
        trace("token_bad_client", f"{gt} basic={basic.startswith('Basic ')} secret={'client_secret' in form}")
        return 401, {"error": "invalid_client"}
    if gt == "authorization_code":
        rec = codes.pop(form.get("code") or "", None)
        if not rec or time.time() - rec["t"] > CODE_TTL or rec["client"] != cid:
            trace("token_bad_code", "нет кода / истёк / чужой клиент")
            return 400, {"error": "invalid_grant"}
        if form.get("redirect_uri") and form["redirect_uri"] != rec["redirect"]:
            trace("token_bad_redirect", form["redirect_uri"][:80])
            return 400, {"error": "invalid_grant"}
        verifier = form.get("code_verifier") or ""
        digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        if not verifier or digest != rec["challenge"]:
            trace("token_bad_pkce", client["name"])
            return 400, {"error": "invalid_grant", "error_description": "PKCE"}
        with srv.meta_lock:
            mine = [gid for gid, g in _m("grants").items() if g.get("uid") == rec["uid"]]
            # Тот же клиент подключается заново — заменяем прежний доступ.
            for gid in [gid for gid in mine if _m("grants")[gid].get("client") == cid]:
                _drop_grant(gid)
            if sum(1 for g in _m("grants").values() if g.get("uid") == rec["uid"]) >= MAX_GRANTS:
                return 400, {"error": "invalid_grant", "error_description": "too many connections"}
            gid = secrets.token_hex(6)
            _m("grants")[gid] = {"uid": rec["uid"], "kind": "oauth", "name": client["name"], "scope": rec["scope"], "created": _now(), "used": None, "client": cid}
            out = _issue(gid, rec["scope"])
            srv.save_meta()
        trace("token_issued", f"{client['name']} {rec['scope']}")
        return 200, out
    if gt == "refresh_token":
        h = srv.token_hash(form.get("refresh_token") or "")
        with srv.meta_lock:
            t = _m("agent_tokens").get(h)
            g = _m("grants").get(t["gid"]) if t else None
            if not t or t.get("type") != "refresh" or not g or g.get("client") != cid or (t.get("exp") and t["exp"] < _now()):
                trace("refresh_bad", client["name"])
                return 400, {"error": "invalid_grant"}
            _m("agent_tokens").pop(h, None)  # refresh одноразовый (ротация)
            for oh in [oh for oh, ot in _m("agent_tokens").items() if ot.get("gid") == t["gid"] and ot.get("type") == "access"]:
                _m("agent_tokens").pop(oh, None)
            out = _issue(t["gid"], g["scope"])
            srv.save_meta()
        trace("token_refreshed", client["name"])
        return 200, out
    trace("token_bad_grant_type", str(gt))
    return 400, {"error": "unsupported_grant_type"}


def revoke_token(form: dict) -> tuple:
    h = srv.token_hash(form.get("token") or "")
    with srv.meta_lock:
        t = _m("agent_tokens").get(h)
        if t:
            g = _m("grants").get(t["gid"])
            if g and g.get("kind") == "oauth":
                _drop_grant(t["gid"])
            srv.save_meta()
    return 200, {}


def authorize_page(q: dict) -> tuple:
    """Страница входа и согласия для коннектора. → (status, html).

    Вход через Telegram должен пережить уход в приложение Telegram: на iPhone
    окно авторизации (Claude, ChatGPT) уходит в фон, а прежний window.open
    уводил саму страницу на t.me — опрос обрывался, и Claude так и не получал
    code. Теперь: ссылка — обычная кнопка tg:// (страница остаётся на месте),
    код входа помнится в sessionStorage, опрос переживает ошибки сети и
    возобновляется при возврате, а после подтверждения страница сама
    разрешает доступ и уходит на redirect_uri с code и тем же state.
    """
    client, p = check_authorize(q)
    if not client:
        trace("authorize_bad", p)
        return 400, _page("Repeat", f"<p class=err>{html.escape(p)}</p>")
    trace("authorize_view", client["name"])
    params = json.dumps({k: p.get(k) for k in ("client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource")})
    want_write = _scope_of(p.get("scope") or "read write") == "write"
    name = html.escape(client["name"])
    body = f"""
<h1>{name} просит доступ к Repeat</h1>
<p class=muted>Что сможет ИИ-ассистент:</p>
<ul>
<li>читать тренировки, программы, план и рабочие веса;</li>
<li>присылать планы и тренировки во «входящие» — записываются только после твоего подтверждения в приложении.</li>
</ul>
<p class=muted>Заметки, самочувствие и фото не передаются. Доступ отзывается в Repeat → Профиль → ИИ-помощник.</p>
<label class=check><input type=checkbox id=write {"checked" if want_write else ""}> Разрешить присылать планы и тренировки</label>
<div id=login hidden>
  <a id=tg class="btn primary">Войти через Telegram</a>
  <p id=wait class=muted hidden>Нажми «Войти» в чате с ботом и вернись сюда — дальше всё само.</p>
  <p class=muted small>Telegram не открылся? <a id=tgweb target=_blank rel=noopener>Открыть через t.me</a></p>
</div>
<div id=consent hidden>
  <button id=allow class=primary>Разрешить</button>
</div>
<p id=status class=muted hidden></p>
<button id=deny>Отказать</button>
<p id=err class=err hidden></p>
<script>
const P = {params};
const KEY = "repeat_oauth_login:" + P.client_id + ":" + (P.state || "");
const $ = (id) => document.getElementById(id);
const show = (id, on) => {{ $(id).hidden = !on; }};
const say = (t) => {{ $("status").textContent = t; show("status", Boolean(t)); }};
const fail = (t) => {{ $("err").textContent = t; show("err", true); }};
let code = null, done = false, timer = null;
async function post(path, body, auth) {{
  const r = await fetch(path, {{ method: "POST", headers: Object.assign({{ "Content-Type": "application/json" }}, auth ? {{ Authorization: "Bearer " + auth }} : {{}}), body: JSON.stringify(body || {{}}) }});
  const j = await r.json().catch(() => ({{}}));
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}}
async function finish(token, temp) {{
  if (done) return; done = true;
  clearInterval(timer);
  say("Вход подтверждён — возвращаемся в {name}…");
  show("login", false); show("consent", false);
  try {{
    const r = await post("/api/oauth/approve", Object.assign({{}}, P, {{ write: $("write").checked }}), token);
    try {{ sessionStorage.removeItem(KEY); }} catch (e) {{}}
    if (temp) post("/api/auth/logout", {{}}, token).catch(() => {{}});
    location.replace(r.redirect);
  }} catch (e) {{ done = false; fail("Не получилось разрешить доступ: " + e.message + ". Обнови страницу."); }}
}}
async function poll() {{
  if (!code || done) return;
  try {{
    const r = await post("/api/auth/web/poll", {{ code, platform: "oauth" }});
    if (r.status === "ok") return finish(r.token, true);
    if (r.status === "denied" || r.status === "expired") {{
      try {{ sessionStorage.removeItem(KEY); }} catch (e) {{}}
      code = null; fail("Вход отменён или устарел — нажми «Войти через Telegram» ещё раз."); start();
    }}
  }} catch (e) {{ /* сеть могла пропасть, пока были в Telegram — попробуем снова */ }}
}}
function links(url) {{
  $("tgweb").href = url;
  // tg:// открывает приложение, не уводя эту страницу (иначе опрос обрывается).
  $("tg").href = url.replace("https://t.me/", "tg://resolve?domain=").replace("?start=", "&start=");
}}
async function start() {{
  try {{
    let saved = null;
    try {{ saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); }} catch (e) {{}}
    if (saved && Date.now() - saved.t < 9 * 60 * 1000) {{ code = saved.code; links(saved.url); }}
    else {{
      const s = await post("/api/auth/web/start");
      code = s.code; links(s.url);
      try {{ sessionStorage.setItem(KEY, JSON.stringify({{ code, url: s.url, t: Date.now() }})); }} catch (e) {{}}
    }}
    show("login", true);
    clearInterval(timer); timer = setInterval(poll, 1500); poll();
  }} catch (e) {{ fail("Вход через Telegram сейчас недоступен — попробуй позже."); }}
}}
$("tg").addEventListener("click", () => show("wait", true));
document.addEventListener("visibilitychange", () => {{ if (document.visibilityState === "visible") poll(); }});
window.addEventListener("focus", poll);
window.addEventListener("pageshow", poll);
$("deny").onclick = () => {{
  const sep = P.redirect_uri.includes("?") ? "&" : "?";
  location.replace(P.redirect_uri + sep + "error=access_denied" + (P.state ? "&state=" + encodeURIComponent(P.state) : ""));
}};
// Уже вошёл на сайте Repeat в этом браузере — хватит одной кнопки.
let site = null;
try {{ site = localStorage.getItem("repeat_session"); }} catch (e) {{}}
if (site) {{
  fetch("/api/oauth/whoami", {{ headers: {{ Authorization: "Bearer " + site }} }})
    .then((r) => {{ if (r.ok) {{ show("consent", true); $("allow").onclick = () => finish(site, false); }} else start(); }})
    .catch(start);
}} else start();
</script>"""
    return 200, _page(f"Repeat — доступ для {name}", body)


def _page(title: str, body: str) -> str:
    return f"""<!doctype html><html lang=ru><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>{title}</title><style>
:root{{--bg:#f6f7f9;--card:#fff;--text:#0f172a;--muted:#64748b;--accent:#16a34a;--line:rgba(15,23,42,.1)}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0b0f14;--card:#141a21;--text:#eef2f7;--muted:#94a3b8;--accent:#22c55e;--line:rgba(238,242,247,.1)}}}}
body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}}
main{{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px;max-width:420px;width:100%;box-sizing:border-box}}
h1{{font-size:20px;margin:0 0 12px}} .muted{{color:var(--muted)}} .err{{color:#dc2626}} ul{{padding-left:20px}}
button{{display:block;width:100%;margin-top:10px;padding:12px;border-radius:14px;border:1px solid var(--line);background:transparent;color:var(--text);font:inherit;font-weight:600;cursor:pointer}}
button.primary,a.btn.primary{{background:var(--accent);border-color:var(--accent);color:#fff}} a{{color:var(--accent)}}
a.btn{{display:block;box-sizing:border-box;text-align:center;text-decoration:none;width:100%;margin-top:10px;padding:12px;border-radius:14px;border:1px solid var(--line);font-weight:600}}
.small{{font-size:13px}}
.check{{display:flex;gap:8px;align-items:center;margin:8px 0}}
</style></head><body><main>{body}</main></body></html>"""


# ───────────── REST v1 (действия GPT, скрипты) ─────────────


def rest_get(ident: dict, path: str, query: dict):
    q = {k: v[0] for k, v in query.items() if v}
    if path == "/api/v1/context":
        return context_view(ident["uid"])
    if path == "/api/v1/workouts":
        return workouts_view(ident["uid"], q)
    if path == "/api/v1/plan":
        return plan_view(ident["uid"], q)
    if path == "/api/v1/format":
        return {"format": format_doc()}
    raise srv.ApiError(404, "not found")


def rest_post(ident: dict, path: str, body):
    body = body if isinstance(body, dict) else {}
    if path == "/api/v1/plan":
        return submit(ident, "plan", body.get("plan", body), body.get("note") if "plan" in body else None)
    if path == "/api/v1/workouts":
        return submit(ident, "workout", body.get("workouts", body), body.get("note"))
    raise srv.ApiError(404, "not found")


def openapi() -> dict:
    b = base_url()
    ro = {"type": "object"}
    return {
        "openapi": "3.1.0",
        "info": {"title": "Repeat", "version": "1.0.0", "description": INSTRUCTIONS},
        "servers": [{"url": b}],
        "components": {"securitySchemes": {"bearer": {"type": "http", "scheme": "bearer"}}, "schemas": {}},
        "security": [{"bearer": []}],
        "paths": {
            "/api/v1/context": {"get": {"operationId": "getContext", "summary": "Сводка тренировок", "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": ro}}}}}},
            "/api/v1/workouts": {
                "get": {"operationId": "listWorkouts", "summary": "Тренировки за период", "parameters": [
                    {"name": "from", "in": "query", "schema": {"type": "string"}},
                    {"name": "to", "in": "query", "schema": {"type": "string"}},
                    {"name": "kind", "in": "query", "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": ro}}}}},
                "post": {"operationId": "submitWorkouts", "summary": "Записать тренировки (repeat-workout) во «входящие»",
                         "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"workouts": {"type": "array", "items": ro}, "note": {"type": "string"}}, "required": ["workouts"]}}}},
                         "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": ro}}}}},
            },
            "/api/v1/plan": {
                "get": {"operationId": "getPlan", "summary": "План по датам", "parameters": [
                    {"name": "from", "in": "query", "schema": {"type": "string"}},
                    {"name": "to", "in": "query", "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": ro}}}}},
                "post": {"operationId": "submitPlan", "summary": "Прислать план (repeat-plan) во «входящие»",
                         "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"plan": ro, "note": {"type": "string"}}, "required": ["plan"]}}}},
                         "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": ro}}}}},
            },
            "/api/v1/format": {"get": {"operationId": "getFormat", "summary": "Описание форматов", "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": ro}}}}}},
        },
    }
