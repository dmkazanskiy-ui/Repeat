"""
Утренняя сводка: каждое утро сервер сам забирает из Garmin ночной HRV, пульс
покоя и сон, кладёт их в Repeat и присылает короткое сообщение от бота.

Без ИИ: перенос цифр — детерминированная загрузка (ingestion job). Garmin не
даёт личному ключу push-уведомлений о синхронизации (они только у партнёров
Health API), поэтому «сразу после синхронизации» делаем частой лёгкой
проверкой: с 04:30 до 11:00 по местному времени (MORNING_TZ, по умолчанию
Asia/Makassar) раз в 3 минуты — два коротких запроса «есть ли сон и HRV за
эту ночь». Как только часы отдали ночь в Garmin Connect, сводка уходит в
течение ~3 минут; после отправки до завтра проверок нет.

Ключ Garmin Personal API — личный ключ владельца, лежит вне репозитория:
systemd LoadCredential (CREDENTIALS_DIRECTORY/garmin) или GARMIN_KEY_FILE.
Сводка — только для владельца (админа Repeat), чей это ключ.

Данные в приложение идут как запись «входящих» типа checkin (как от MCP):
приложение вписывает их в самочувствие, ничего не удаляя.
"""
import json
import os
import statistics
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

srv = None
agent = None

GARMIN = "https://personal.connectapi.garmin.com"
TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token"
TZ = os.environ.get("MORNING_TZ", "Asia/Makassar")
START_HOUR, START_MIN, END_HOUR = 4, 30, 11
POLL_S = 180
UA = "repeat-sync/1.0"

state_lock = threading.Lock()


def bind(server_module, agent_module) -> None:
    global srv, agent
    srv, agent = server_module, agent_module


def log(step: str, detail: str = "") -> None:
    try:
        import sys

        print(json.dumps({"t": int(time.time()), "morning": step, "d": str(detail)[:160]}, ensure_ascii=False), file=sys.stderr, flush=True)
    except Exception:
        pass


# ───────────── Garmin ─────────────


def key_path():
    cred = os.environ.get("CREDENTIALS_DIRECTORY")
    if cred and os.path.exists(os.path.join(cred, "garmin")):
        return os.path.join(cred, "garmin")
    p = os.environ.get("GARMIN_KEY_FILE", "")
    return p if p and os.path.exists(p) else None


def configured() -> bool:
    return key_path() is not None


def _token_file() -> str:
    return os.path.join(srv.DATA_DIR, "garmin-token.json")


def _token(force: bool = False) -> str:
    if not force:
        try:
            with open(_token_file(), encoding="utf-8") as f:
                t = json.load(f)
            if t.get("exp", 0) > time.time():
                return t["token"]
        except (OSError, ValueError, KeyError):
            pass
    with open(key_path(), encoding="utf-8") as f:
        key = f.read().strip()
    req = urllib.request.Request(GARMIN + TOKEN_PATH, data=b"", method="POST", headers={"Authorization": f"ApiKey {key}", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode().strip()
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise RuntimeError("garmin_key_rejected")
        raise
    try:
        data = json.loads(text)
        tok = (data.get("access_token") or data.get("accessToken")) if isinstance(data, dict) else data
    except ValueError:
        tok = text
    tok = str(tok).strip('"')
    tmp = _token_file() + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"token": tok, "exp": time.time() + 23 * 3600}, f)
    os.replace(tmp, _token_file())
    return tok


def garmin_get(path: str, params=None):
    q = ("?" + urllib.parse.urlencode(params)) if params else ""
    for attempt in range(2):
        req = urllib.request.Request(GARMIN + path + q, headers={"Authorization": f"Bearer {_token(force=attempt == 1)}", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
            return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            if e.code == 401 and attempt == 0:
                continue
            raise
    return None


def garmin_raw(path: str) -> bytes:
    for attempt in range(2):
        req = urllib.request.Request(GARMIN + path, headers={"Authorization": f"Bearer {_token(force=attempt == 1)}", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read(9 * 1024 * 1024)
        except urllib.error.HTTPError as e:
            if e.code == 401 and attempt == 0:
                continue
            raise
    return b""


def night_ready(day: str) -> bool:
    """Лёгкая проверка: за эту ночь в Garmin уже есть сон и HRV."""
    sleep = garmin_get("/sleep-service/sleep/dailySleepSummariesByDate", {"startDate": day, "endDate": day}) or []
    if not any(s.get("calendarDate") == day and s.get("sleepTimeSeconds") for s in sleep):
        return False
    hrv = (garmin_get(f"/hrv-service/hrv/daily/{day}/{day}") or {}).get("hrvSummaries") or []
    return any(h.get("calendarDate") == day and h.get("lastNightAvg") for h in hrv)


def collect(day: str, back: int = 30) -> dict:
    """Дни [day-back, day] → {date: {hrvMs, restingHr, sleepMin, sleepScore, bodyBattery}} + статус HRV Garmin."""
    a = (date.fromisoformat(day) - timedelta(days=back)).isoformat()
    out: dict = {}
    garmin_status = {}

    def row(d):
        return out.setdefault(d, {"date": d})

    hrv = (garmin_get(f"/hrv-service/hrv/daily/{a}/{day}") or {}).get("hrvSummaries") or []
    for h in hrv:
        if h.get("lastNightAvg"):
            row(h["calendarDate"])["hrvMs"] = h["lastNightAvg"]
        if h.get("calendarDate") == day:
            b = h.get("baseline") or {}
            garmin_status = {"status": h.get("status"), "low": b.get("balancedLow"), "high": b.get("balancedUpper")}
    for s in garmin_get("/sleep-service/sleep/dailySleepSummariesByDate", {"startDate": a, "endDate": day}) or []:
        if s.get("sleepTimeSeconds"):
            r = row(s["calendarDate"])
            r["sleepMin"] = round(s["sleepTimeSeconds"] / 60)
            score = ((s.get("sleepScores") or {}).get("overall") or {}).get("value")
            if isinstance(score, (int, float)):
                r["sleepScore"] = round(score)
    for d in (garmin_get("/usersummary-service/v2/dailysummaries", {"startDate": a, "endDate": day}) or {}).get("data") or []:
        r = row(d["calendarDate"])
        rest = (d.get("heartRate") or {}).get("restingValue")
        if rest:
            r["restingHr"] = rest
        bb = (d.get("bodyBattery") or {}).get("maxValue")
        if isinstance(bb, (int, float)) and 0 <= bb <= 100:
            r["bodyBattery"] = round(bb)
    return {"days": out, "garmin": garmin_status}


# ───────────── Сводка ─────────────


def local_now() -> datetime:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(TZ))
    except Exception:
        return datetime.utcnow() + timedelta(hours=8)


def owner():
    return srv.META.get("admin")


def settings(uid: str) -> dict:
    st = srv.load_state(uid) or {"records": {}}
    rec = st["records"].get("settings\u0000morning")
    data = rec.get("data") if rec else None
    out = {"telegram": True, "hideNumbers": False}
    if isinstance(data, dict):
        out.update({k: bool(data[k]) for k in ("telegram", "hideNumbers") if k in data})
    return out


def plan_today(uid: str, day: str) -> list:
    st = srv.load_state(uid) or {"records": {}}
    recs = [r for r in st["records"].values() if r.get("data") is not None]
    live = {r["id"] for r in recs if r["c"] == "plans" and not r["data"].get("archivedAt")}
    cards = [r["data"] for r in recs if r["c"] == "plannedSessions" and r["data"].get("planId") in live and r["data"].get("date") == day and r["data"].get("status") != "skipped"]
    cards.sort(key=lambda c: (c.get("time") or "", c.get("id") or ""))
    return cards


def signals(days: dict, day: str, garmin: dict) -> dict:
    cur = days.get(day, {})
    past = [v for k, v in days.items() if k < day and k >= (date.fromisoformat(day) - timedelta(days=28)).isoformat()]
    hrv_vals = [v["hrvMs"] for v in past if v.get("hrvMs")]
    rhr_vals = [v["restingHr"] for v in past if v.get("restingHr")]
    hrv_base = statistics.median(hrv_vals) if len(hrv_vals) >= 5 else None
    rhr_base = statistics.median(rhr_vals) if len(rhr_vals) >= 5 else None
    hrv, rhr = cur.get("hrvMs"), cur.get("restingHr")

    def low(v):
        return v is not None and (v < hrv_base * 0.9 if hrv_base else v < 50)

    streak, d = 0, date.fromisoformat(day)
    for _ in range(7):
        if low(days.get(d.isoformat(), {}).get("hrvMs")):
            streak += 1
            d -= timedelta(days=1)
        else:
            break
    rhr_high = rhr is not None and (rhr >= rhr_base + 5 if rhr_base else rhr > 52)
    return {
        "hrv": hrv, "hrvBase": hrv_base, "rhr": rhr, "rhrBase": rhr_base,
        "sleepMin": cur.get("sleepMin"), "sleepScore": cur.get("sleepScore"), "bodyBattery": cur.get("bodyBattery"),
        "lowHrvDays": streak, "rhrHigh": rhr_high, "overreach": streak >= 2 or rhr_high,
        "garminStatus": garmin.get("status"),
    }


def _pct(v, base):
    return round((v / base - 1) * 100) if v and base else None


def message(sig: dict, cards: list, hide: bool) -> str:
    lines = []
    head = "⚠️ Организм просит день полегче" if sig["overreach"] else "☀️ Доброе утро — восстановление в норме"
    lines.append(head)
    if not hide:
        parts = []
        if sig["sleepMin"]:
            s = f"сон {sig['sleepMin'] // 60} ч {sig['sleepMin'] % 60:02d} мин"
            if sig.get("sleepScore"):
                s += f" ({sig['sleepScore']})"
            parts.append(s)
        if sig["hrv"]:
            p = _pct(sig["hrv"], sig["hrvBase"])
            parts.append(f"HRV {sig['hrv']}" + (f" ({'+' if p >= 0 else ''}{p}% к норме)" if p is not None else ""))
        if sig["rhr"]:
            d = round(sig["rhr"] - sig["rhrBase"]) if sig["rhrBase"] else None
            parts.append(f"пульс покоя {sig['rhr']}" + (f" ({'+' if d >= 0 else ''}{d})" if d is not None else ""))
        if parts:
            lines.append(" · ".join(parts))
    if cards:
        plan = ", ".join(f"{c.get('time') + ' ' if c.get('time') else ''}{c.get('title')}" for c in cards[:4])
        lines.append(f"Сегодня: {plan}")
        if sig["overreach"] and any(c.get("kind") == "strength" and c.get("status") == "planned" for c in cards):
            lines.append("Силовую лучше заменить дорожкой — кнопка на экране дня.")
    else:
        lines.append("По плану сегодня отдых.")
    return "\n".join(lines)


def run(uid: str, force: bool = False) -> dict:
    """Собрать и отправить сводку. force — отправить сейчас (кнопка «Прислать сейчас»)."""
    if not configured():
        return {"ok": False, "error": "garmin_not_configured"}
    day = local_now().date().isoformat()
    with state_lock:
        m = srv.META.setdefault("morning", {})
        rec = m.get(uid, {})
        if rec.get("date") == day and not force:
            return {"ok": True, "status": "already_sent"}
        first = not rec.get("backfilled")
    try:
        if not force and not night_ready(day):
            return {"ok": True, "status": "waiting"}
        log("night_synced", day)
        got = collect(day, 30)
    except RuntimeError as e:
        log("garmin_error", str(e))
        return {"ok": False, "error": str(e)}
    except Exception as e:  # сеть, формат
        log("garmin_error", type(e).__name__)
        return {"ok": False, "error": "garmin_unavailable"}
    days = got["days"]
    today = days.get(day, {})
    if not force and not (today.get("sleepMin") and today.get("hrvMs")):
        log("wait", "ночные данные ещё не синхронизировались")
        return {"ok": True, "status": "waiting"}
    # В приложение: в первый раз — месяц (для личной нормы), дальше — 3 дня.
    keep = sorted(days)[-31:] if first else sorted(days)[-3:]
    push = [days[k] for k in keep if len(days[k]) > 1]
    if push:
        agent.submit_checkin({"uid": uid, "scope": "write", "name": "Garmin"}, push, "Garmin")
    sig = signals(days, day, got["garmin"])
    cfg = settings(uid)
    sent = False
    if cfg["telegram"]:
        text = message(sig, plan_today(uid, day), cfg["hideNumbers"])
        try:
            srv.bot_api("sendMessage", {
                "chat_id": int(uid),
                "text": text,
                "reply_markup": {"inline_keyboard": [[{"text": "Открыть Repeat", "web_app": {"url": srv.APP_URL}}]]},
            })
            sent = True
        except Exception as e:
            log("telegram_error", type(e).__name__)
    with state_lock:
        srv.META.setdefault("morning", {})[uid] = {"date": day, "t": int(time.time()), "backfilled": True, "sent": sent}
        srv.save_meta()
    srv.log_event("morning", uid, "sent" if sent else "saved", f"{len(push)} дн.")
    log("done", f"days={len(push)} telegram={sent} overreach={sig['overreach']}")
    return {"ok": True, "status": "sent" if sent else "saved", "summary": sig}


def notify_once(uid: str, kind: str, text: str) -> bool:
    """Служебное сообщение не чаще раза в день на вид (heartbeat)."""
    day = local_now().date().isoformat()
    with state_lock:
        rec = srv.META.setdefault("morning", {}).setdefault(uid, {})
        alerts = rec.setdefault("alerts", {})
        if alerts.get(kind) == day:
            return False
        alerts[kind] = day
        srv.save_meta()
    if not settings(uid)["telegram"]:
        return False
    try:
        srv.bot_api("sendMessage", {"chat_id": int(uid), "text": text, "reply_markup": {"inline_keyboard": [[{"text": "Открыть Repeat", "web_app": {"url": srv.APP_URL}}]]}})
        log("alert", kind)
        return True
    except Exception as e:
        log("telegram_error", type(e).__name__)
        return False


def tick() -> None:
    uid = owner()
    if not uid or not configured():
        return
    now = local_now()
    day = now.date().isoformat()
    if (now.hour, now.minute) < (START_HOUR, START_MIN):
        return
    sent_today = srv.META.get("morning", {}).get(uid, {}).get("date") == day
    if now.hour >= END_HOUR:
        # Окно закрылось, а ночи так и нет — одна строка вместо тишины.
        if not sent_today and now.hour < END_HOUR + 2:
            notify_once(uid, "missing", "Часы не отдали ночь в Garmin Connect — утренней сводки сегодня не будет. Открой Garmin Connect на телефоне, чтобы синхронизировать.")
        return
    res = run(uid)
    if res.get("error") == "garmin_key_rejected":
        notify_once(uid, "key", "Garmin отклонил ключ — утренняя сводка не работает. Создай новый ключ в Garmin Connect и пришли его, я положу на сервер.")


def loop() -> None:
    time.sleep(30)
    while True:
        try:
            tick()
        except Exception as e:
            log("tick_error", type(e).__name__)
        time.sleep(POLL_S)


# ───────────── Автоимпорт тренировок Garmin ─────────────
#
# Раз в 5 минут смотрим новые активности в Garmin за последние 3 дня, скачиваем
# FIT, раскладываем подробности (details.py) и кладём тренировку во «входящие»
# (тип workout, с source=garmin и сводкой). Приложение не создаст дубль: та же
# активность по source+ID — пропуск, похожая тренировка того же вида в пределах
# 15 минут — дополнение, а не новая. Импортированные ID помним в meta.json.

IMPORT_POLL_S = 300
IMPORT_DAYS = 3


def _kind(type_key: str, act=None):
    k = (type_key or "").lower()
    # Ходьба на дорожке на часах часто пишется обычной «Ходьбой» (не «в
    # помещении»): без GPS-координат считаем её дорожкой, с маршрутом — прогулкой.
    no_gps = act is not None and act.get("startLatitude") is None and not act.get("hasPolyline")
    if "run" in k and ("treadmill" in k or "indoor" in k):
        return {"kind": "cardio", "cardioKind": "treadmill_run"}
    if "run" in k:
        return {"kind": "cardio", "cardioKind": "run"}
    if "cycl" in k or "bik" in k or "ride" in k:
        return {"kind": "cardio", "cardioKind": "bike"}
    if "swim" in k:
        return {"kind": "cardio", "cardioKind": "swim"}
    if k in ("treadmill_walking", "indoor_walking"):
        return {"kind": "cardio", "cardioKind": "treadmill"}
    if "elliptical" in k:
        return {"kind": "cardio", "cardioKind": "elliptical"}
    if "stair" in k:
        return {"kind": "cardio", "cardioKind": "stairs"}
    if "strength" in k:
        return {"kind": "strength"}
    if "yoga" in k:
        return {"kind": "mobility", "mobilityKind": "yoga"}
    if "breath" in k:
        return {"kind": "mobility", "mobilityKind": "breathing"}
    if "walk" in k or "hik" in k:
        # Уличной ходьбы среди видов нет — свой вид «Прогулка» (дорожка — отдельно).
        if "hik" in k:
            return {"kind": "cardio", "cardioKind": "Поход"}
        return {"kind": "cardio", "cardioKind": "treadmill" if ("indoor" in k or no_gps) else "Прогулка"}
    return {"kind": "cardio", "cardioKind": None}


def import_new(uid: str) -> dict:
    day = local_now().date()
    a = (day - timedelta(days=IMPORT_DAYS)).isoformat()
    with state_lock:
        st = srv.META.setdefault("garmin_import", {}).setdefault(uid, {"seen": []})
        seen = set(st.get("seen", []))
    acts = garmin_get("/activitylist-service/activities/search/activities", {"start": 0, "limit": 20, "startDate": a, "endDate": day.isoformat()})
    acts = acts if isinstance(acts, list) else (acts or {}).get("activityList") or []
    added = []
    by_date: dict = {}
    for act in sorted(acts, key=lambda x: x.get("startTimeLocal") or ""):
        aid = str(act.get("activityId") or "")
        if not aid or aid in seen:
            continue
        kind = _kind((act.get("activityType") or {}).get("typeKey"), act)
        name = (act.get("activityName") or "").strip()[:80] or None
        # Подробности из FIT (графики, маршрут, круги); без FIT — сводка из списка.
        res = {"ok": False}
        try:
            fit = garmin_raw(f"/download-service/files/activity/{aid}")
            import base64

            res = srv.details.enrich({"uid": uid, "scope": "write", "name": "Garmin"},
                                     {"source": "garmin", "externalActivityId": aid, "sportType": (act.get("activityType") or {}).get("typeKey"),
                                      "fitBase64": base64.b64encode(fit).decode()}, with_inbox=False)
        except Exception as e:
            log("garmin_fit_error", type(e).__name__)
        summary = dict(res.get("summary") or {}) if res.get("ok") else {}
        for k, src in (("distanceM", "distance"), ("elapsedSec", "duration"), ("movingSec", "movingDuration"), ("avgHr", "averageHR"),
                       ("maxHr", "maxHR"), ("calories", "calories"), ("ascentM", "elevationGain")):
            if summary.get(k) is None and isinstance(act.get(src), (int, float)):
                summary[k] = act[src]
        start_local = act.get("startTimeLocal") or ""
        date = start_local[:10] or day.isoformat()
        time_hm = start_local[11:16] or None
        timer = summary.get("timerSec") or summary.get("movingSec") or summary.get("elapsedSec")
        w = {
            "date": date,
            "time": time_hm,
            "kind": kind["kind"],
            "title": name,
            "done": True,
            "durationMin": round(timer / 60, 2) if timer else None,
            "source": {"provider": "garmin", "externalId": aid, "detail": res.get("level") if res.get("ok") else "summary"},
            "summary": {k: v for k, v in summary.items() if not isinstance(v, (dict, list))},
        }
        if kind.get("cardioKind"):
            w["cardioKind"] = kind["cardioKind"]
        if kind.get("mobilityKind"):
            w["mobilityKind"] = kind["mobilityKind"]
        if summary.get("distanceM"):
            w["distanceKm"] = round(summary["distanceM"] / 1000, 3)
        if summary.get("avgHr"):
            w["avgHr"] = summary["avgHr"]
        if summary.get("calories"):
            w["calories"] = summary["calories"]
        by_date.setdefault(date, []).append((aid, w))
    # Одна пачка на день: приложение сопоставит все тренировки дня с дневником
    # сразу (две пробежки на часах при одной в дневнике — пара по времени + новая).
    for date, items in sorted(by_date.items()):
        doc = {"format": "repeat-workout", "version": 1, "workouts": [w for _, w in items]}
        ids = [aid for aid, _ in items]
        r = agent.submit({"uid": uid, "scope": "write", "name": "Garmin"}, "workout", doc, None, "garmin-" + "-".join(ids))
        if r.get("ok"):
            added.extend(ids)
            seen.update(ids)
    with state_lock:
        st = srv.META.setdefault("garmin_import", {}).setdefault(uid, {"seen": []})
        st["seen"] = (st.get("seen", []) + [x for x in added if x not in st.get("seen", [])])[-500:]
        srv.save_meta()
    if added:
        log("garmin_import", f"{len(added)}")
    return {"ok": True, "added": added}


def import_settings(uid: str) -> dict:
    st = srv.load_state(uid) or {"records": {}}
    rec = st["records"].get("settings\u0000watchImport")
    data = rec.get("data") if rec else None
    return {"enabled": True, **(data if isinstance(data, dict) else {})}


def import_loop() -> None:
    time.sleep(60)
    while True:
        try:
            uid = owner()
            if uid and configured() and import_settings(uid).get("enabled", True):
                import_new(uid)
        except Exception as e:
            log("import_error", type(e).__name__)
        time.sleep(IMPORT_POLL_S)
