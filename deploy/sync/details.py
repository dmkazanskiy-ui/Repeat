"""
Подробности тренировки (круги, отрезки, зоны, временные ряды, маршрут) —
отдельно от синхронизации. Тренировка в данных человека остаётся лёгкой
(сводка + ссылка на источник), а тяжёлое лежит файлом на сервере
DATA_DIR/details/<uid>/<source>-<id>.json и отдаётся только владельцу при
открытии экрана тренировки. Так 200+ пробежек с секундными рядами не упираются
в лимит синхронизации и не тянутся на каждое устройство.

Откуда берутся: ИИ-помощник с доступом к часам (COROS MCP, Garmin MCP) зовёт
MCP-инструмент enrich_activity — со сводкой и кругами из API источника и/или
FIT-файлом (base64 или ссылка на скачивание). FIT разбирает fitparse.py.
В приложение уходит запись «входящих» типа enrich: человек подтверждает, что
тренировка обновится; новые тренировки этим путём не создаются.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import fitparse

srv = None
agent = None

MAX_FIT = 8 * 1024 * 1024
MAX_DOC = 6 * 1024 * 1024
SOURCES = {"coros", "garmin", "strava", "polar", "suunto", "other"}
ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
# Откуда сервер согласен скачивать FIT по ссылке (подписанные ссылки хранилищ источников).
FIT_HOSTS = tuple(h.strip() for h in os.environ.get("FIT_HOSTS", "coros.com,amazonaws.com,aliyuncs.com,myqcloud.com,garmin.com").split(",") if h.strip())

# Сводка: какие поля и в каких единицах принимаем от ИИ (адаптер источника — на его стороне по контракту).
SUMMARY_FIELDS = {
    "startedAt": str, "endedAt": str, "timezone": str,
    "timerSec": float, "elapsedSec": float, "movingSec": float,
    "distanceM": float, "calories": float,
    "avgPaceSec": float, "movingPaceSec": float, "effortPaceSec": float, "bestKmSec": float,
    "avgHr": float, "maxHr": float, "avgCadence": float, "maxCadence": float,
    "avgStrideM": float, "avgPower": float, "maxPower": float,
    "minAltM": float, "maxAltM": float, "avgAltM": float, "ascentM": float, "descentM": float,
    "trainingLoad": float, "aerobicTE": float, "anaerobicTE": float, "trainingFocus": str,
    "avgStanceTimeMs": float, "avgVerticalRatio": float, "avgVerticalOscillationCm": float,
    "efficiencyPct": float, "efficiencyLabel": str, "performanceLabel": str,
}
LAP_FIELDS = ("index", "startOffsetSec", "timerSec", "elapsedSec", "distanceM", "avgSpeed", "avgPaceSec",
              "avgHr", "maxHr", "avgCadence", "maxCadence", "avgPower", "maxPower", "ascentM", "descentM", "calories", "partial")


def bind(server_module, agent_module) -> None:
    global srv, agent
    srv, agent = server_module, agent_module


def _dir(uid: str) -> str:
    return os.path.join(srv.DATA_DIR, "details", str(int(uid)))


def _path(uid: str, source: str, ext_id: str) -> str:
    return os.path.join(_dir(uid), f"{source}-{ext_id}.json")


def load(uid: str, source: str, ext_id: str):
    if source not in SOURCES or not ID_RE.match(ext_id or ""):
        return None
    try:
        with open(_path(uid, source, ext_id), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save(uid: str, source: str, ext_id: str, doc: dict) -> int:
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    if len(raw) > MAX_DOC:
        raise srv.ApiError(413, "detail too large")
    os.makedirs(_dir(uid), exist_ok=True)
    tmp = _path(uid, source, ext_id) + ".tmp"
    with open(tmp, "wb") as f:
        f.write(raw)
    os.replace(tmp, _path(uid, source, ext_id))
    return len(raw)


def forget(uid: str) -> None:
    """Удаление аккаунта: все подробности человека."""
    d = _dir(uid)
    if os.path.isdir(d):
        for p in os.listdir(d):
            try:
                os.remove(os.path.join(d, p))
            except OSError:
                pass
        try:
            os.rmdir(d)
        except OSError:
            pass


def _num(v, lo=-1e9, hi=1e9):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or not (lo <= v <= hi):
        return None
    return v


def clean_summary(raw) -> dict:
    out = {}
    if not isinstance(raw, dict):
        return out
    for k, typ in SUMMARY_FIELDS.items():
        v = raw.get(k)
        if v is None:
            continue
        if typ is str:
            if isinstance(v, str) and v.strip():
                out[k] = v.strip()[:80]
        else:
            n = _num(v)
            if n is not None:
                out[k] = n
    return out


def clean_laps(raw) -> list:
    out = []
    if not isinstance(raw, list):
        return out
    for i, lp in enumerate(raw[:1000]):
        if not isinstance(lp, dict):
            continue
        row = {"group": str(lp.get("group") or "recorded")[:24]}
        for k in LAP_FIELDS:
            v = lp.get(k)
            if k == "partial":
                if v is True:
                    row[k] = True
                continue
            n = _num(v)
            if n is not None:
                row[k] = n
        row.setdefault("index", i + 1)
        out.append(row)
    return out


def clean_zones(raw) -> list:
    out = []
    if not isinstance(raw, list):
        return out
    for z in raw[:6]:
        if not isinstance(z, dict) or z.get("metric") not in ("hr", "pace", "power"):
            continue
        secs = [(_num(x, 0, 1e6)) for x in (z.get("seconds") or [])][:12]
        if not secs:
            continue
        out.append({
            "metric": z["metric"],
            "seconds": secs,
            "upperBounds": [_num(x) for x in (z.get("upperBounds") or [])][:12] or None,
            "names": [str(x)[:24] for x in (z.get("names") or [])][:12] or None,
            "origin": str(z.get("origin") or "source")[:24],
        })
    return out


def _fetch_fit(url: str) -> bytes:
    u = urllib.parse.urlsplit(url or "")
    if u.scheme != "https" or not u.hostname or not any(u.hostname == h or u.hostname.endswith("." + h) for h in FIT_HOSTS):
        raise ValueError("fitUrl: разрешены только https-ссылки хранилищ источника")
    req = urllib.request.Request(url, headers={"User-Agent": "repeat-sync/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read(MAX_FIT + 1)
    if len(data) > MAX_FIT:
        raise ValueError("FIT больше 8 МБ")
    return data


def _maybe_unzip(data: bytes) -> bytes:
    if data[:2] == b"PK":
        import io
        import zipfile

        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in z.namelist():
                if name.lower().endswith(".fit"):
                    return z.read(name)
    return data


def enrich(ident: dict, args: dict, with_inbox: bool = True) -> dict:
    """MCP enrich_activity: собрать документ подробностей, сохранить, положить «входящее»."""
    if ident.get("scope") != "write":
        raise srv.ApiError(403, "read-only key")
    source = str(args.get("source") or "").lower()
    ext_id = str(args.get("externalActivityId") or "").strip()
    if source not in SOURCES:
        return {"ok": False, "errors": [f"source — одно из {sorted(SOURCES)}"]}
    if not ID_RE.match(ext_id):
        return {"ok": False, "errors": ["externalActivityId — строка (длинные ID COROS передавай строкой)"]}
    uid = ident["uid"]
    prev = load(uid, source, ext_id) or {}
    doc = {
        "version": 1,
        "source": source,
        "externalActivityId": ext_id,
        "sportType": args.get("sportType") if isinstance(args.get("sportType"), (int, str)) else prev.get("sportType"),
        "summary": dict(prev.get("summary") or {}),
        "laps": list(prev.get("laps") or []),
        "zones": list(prev.get("zones") or []),
        "streams": prev.get("streams"),
        "pauses": prev.get("pauses") or [],
        "missing": [],
    }
    errors = []
    fit = None
    try:
        if isinstance(args.get("fitBase64"), str) and args["fitBase64"]:
            raw = args["fitBase64"]
            if len(raw) > MAX_FIT * 4 // 3 + 16:
                raise ValueError("FIT больше 8 МБ")
            fit = base64.b64decode(raw)
        elif isinstance(args.get("fitUrl"), str) and args["fitUrl"]:
            fit = _fetch_fit(args["fitUrl"])
    except Exception as e:  # плохая ссылка/кодировка — не роняем остальное
        errors.append(f"FIT не получен: {str(e)[:120]}")
    if fit:
        try:
            parsed = fitparse.parse(_maybe_unzip(fit))
            # FIT — первоисточник рядов и записанных кругов; сводку из API не затираем.
            for k, v in parsed["summary"].items():
                doc["summary"].setdefault(k, v)
            if parsed["laps"]:
                doc["laps"] = [lp for lp in doc["laps"] if lp.get("group") != "recorded"] + parsed["laps"]
            if parsed["zones"] and not any(z.get("metric") == "hr" for z in doc["zones"]):
                doc["zones"] += parsed["zones"]
            if len(parsed["streams"].get("t") or []) > 1:
                doc["streams"] = parsed["streams"]
                doc["pauses"] = parsed["pauses"]
            doc["parser"] = parsed["parser"]
        except Exception as e:
            errors.append(f"FIT не разобран: {type(e).__name__}")
    # Сводка и группы отрезков от источника — поверх (они точнее для проприетарных метрик).
    doc["summary"].update(clean_summary(args.get("summary")))
    laps = clean_laps(args.get("laps"))
    if laps:
        groups = {lp["group"] for lp in laps}
        doc["laps"] = [lp for lp in doc["laps"] if lp.get("group") not in groups] + laps
    zones = clean_zones(args.get("zones"))
    if zones:
        metrics = {z["metric"] for z in zones}
        doc["zones"] = [z for z in doc["zones"] if z.get("metric") not in metrics] + zones
    # Отрезки по 1/5 км — из рядов (активное время), если источник их не прислал.
    st = doc.get("streams") or {}
    have = {lp.get("group") for lp in doc["laps"]}
    if st.get("dist"):
        if "km" not in have:
            doc["laps"] += fitparse.splits(st, 1000, "km")
        if "km5" not in have and (doc["summary"].get("distanceM") or 0) > 5000:
            doc["laps"] += fitparse.splits(st, 5000, "km5")
    for key, label in (("streams", "временные ряды"), ("zones", "зоны")):
        if not doc.get(key):
            doc["missing"].append(label)
    if not (st.get("lat") and any(x is not None for x in st.get("lat", []))):
        doc["missing"].append("маршрут")
    level = "streams" if st.get("t") else ("laps" if doc["laps"] else "summary")
    doc["level"] = level
    doc["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if not doc["summary"] and not doc["laps"] and not st:
        return {"ok": False, "errors": errors or ["нечего сохранить: пришли summary, laps или FIT"]}
    size = save(uid, source, ext_id, doc)
    if fit:
        _note_fit(uid, source)
    if not with_inbox:  # автоимпорт сам кладёт тренировку во «входящие»
        return {"ok": True, "level": level, "summary": doc["summary"], "missing": doc["missing"], "warnings": errors}

    # Во «входящие» — только сводка: тренировка обновится после подтверждения.
    brief = {k: doc["summary"][k] for k in ("startedAt", "endedAt", "timerSec", "elapsedSec", "movingSec", "distanceM", "calories",
                                            "avgHr", "maxHr", "avgCadence", "avgPower", "ascentM", "descentM", "trainingLoad",
                                            "aerobicTE", "anaerobicTE", "trainingFocus", "avgPaceSec", "bestKmSec") if k in doc["summary"]}
    item_id = "in_" + secrets.token_hex(8)
    digest = hashlib.sha256(f"{source}:{ext_id}:{json.dumps(brief, sort_keys=True)}:{level}".encode()).hexdigest()[:24]
    item = {
        "id": item_id,
        "type": "enrich",
        "payload": {"source": source, "externalActivityId": ext_id, "summary": brief, "level": level,
                    "laps": sum(1 for lp in doc["laps"] if lp.get("group") == "recorded"), "missing": doc["missing"]},
        "source": srv.clean_text(ident.get("name"), 40) or "ИИ",
        "note": None,
        "createdAt": doc["updatedAt"],
        "digest": digest,
    }
    with srv.lock:
        state = srv.load_state(uid)
        if state is None:
            return {"ok": False, "errors": ["у пользователя ещё нет данных"]}
        pending = [r for r in state["records"].values() if r["c"] == "inbox" and r.get("data") is not None]
        if not any(isinstance(r["data"], dict) and r["data"].get("digest") == digest for r in pending):
            if len(pending) >= agent.MAX_INBOX * 3:
                return {"ok": False, "errors": ["во «входящих» слишком много неразобранного — попроси человека открыть Repeat"]}
            state["rev"] += 1
            state["records"][f"inbox\u0000{item_id}"] = {"c": "inbox", "id": item_id, "ts": int(time.time() * 1000), "rev": state["rev"], "data": item}
            srv.save_state(uid, state, json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode())
    srv.log_event("agent_enrich", uid, source, level)
    out = {"ok": True, "level": level, "laps": sum(1 for lp in doc["laps"] if lp.get("group") == "recorded"),
           "points": len(st.get("t") or []), "missing": doc["missing"], "bytes": size,
           "message": "Подробности сохранены. Тренировка обновится в Repeat после подтверждения человеком."}
    if errors:
        out["warnings"] = errors
    return out


# ───────────── Очередь догрузки истории ─────────────
#
# В источник (COROS) ходит ИИ-помощник, а не сервер, поэтому очередь — это
# ответ на вопрос «что догрузить следующим»: тренировки, связанные с
# источником, у которых нет кругов или рядов, свежие первыми, и сколько FIT
# ещё можно взять сегодня (лимит COROS — 50 файлов за 24 часа, берём 45 с запасом).

FIT_DAILY = {"coros": 45}


def _note_fit(uid: str, source: str) -> None:
    now = int(time.time())
    with srv.meta_lock:
        log = srv.META.setdefault("fit_log", {}).setdefault(f"{uid}:{source}", [])
        log.append(now)
        log[:] = [t for t in log if now - t < 86400]
        srv.mark_dirty()


def fit_left(uid: str, source: str):
    cap = FIT_DAILY.get(source)
    if cap is None:
        return None
    now = int(time.time())
    with srv.meta_lock:
        used = [t for t in srv.META.get("fit_log", {}).get(f"{uid}:{source}", []) if now - t < 86400]
    return max(0, cap - len(used))


def queue(uid: str, source: str = "coros", limit: int = 20) -> dict:
    state = srv.load_state(uid) or {"records": {}}
    items = []
    for r in state["records"].values():
        d = r.get("data")
        if r["c"] != "sessions" or not isinstance(d, dict):
            continue
        src = d.get("source") or {}
        if src.get("provider") != source or not ID_RE.match(str(src.get("externalId") or "")):
            continue
        doc = load(uid, source, src["externalId"])
        level = (doc or {}).get("level") or "none"
        items.append({
            "externalActivityId": src["externalId"],
            "sportType": src.get("sportType"),
            "date": d.get("date"),
            "kind": d.get("kind"),
            "cardioKind": d.get("cardioKind"),
            "level": level,
        })
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    counts = {lv: sum(1 for x in items if x["level"] == lv) for lv in ("none", "summary", "laps", "streams")}
    # Сначала всем сводку и круги (без лимита), потом FIT для бега — по лимиту.
    need_summary = [x for x in items if x["level"] in ("none", "summary")]
    need_fit = [x for x in items if x["level"] != "streams" and x["kind"] == "cardio"]
    left = fit_left(uid, source)
    return {
        "source": source,
        "total": len(items),
        "counts": counts,
        "fitLeftToday": left,
        "next": {
            "summaryAndLaps": need_summary[: max(1, min(100, limit))],
            "fit": need_fit[: (min(limit, left) if left is not None else limit)],
        },
        "hint": "Сначала summary + laps для всех (getActivityDetail, queryActivityLapData), затем FIT для бега по лимиту источника — свежие первыми. Повтор того же — без дублей.",
    }
