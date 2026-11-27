"""
Разбор FIT (Garmin/COROS и др.) без зависимостей — только то, что нужно
экрану тренировки: сессия (сводка), круги, записи (временные ряды и GPS),
события таймера (паузы) и время в зонах, если их записали часы.

Единицы на выходе — СИ и привычные спорту: метры, секунды, м/с, уд/мин,
шаг/мин, Вт, мс, см, %. Масштабы — по профилю FIT SDK; отсутствующее поле —
None (ноль остаётся нулём). Проприетарные developer fields пропускаются.
"""
import struct
from datetime import datetime, timezone

FIT_EPOCH = 631065600  # 1989-12-31T00:00:00Z

# base type → (struct-код, размер, «нет значения»)
BASE = {
    0x00: ("B", 1, 0xFF), 0x01: ("b", 1, 0x7F), 0x02: ("B", 1, 0xFF),
    0x83: ("h", 2, 0x7FFF), 0x84: ("H", 2, 0xFFFF), 0x85: ("i", 4, 0x7FFFFFFF),
    0x86: ("I", 4, 0xFFFFFFFF), 0x07: ("s", 1, None), 0x88: ("f", 4, None),
    0x89: ("d", 8, None), 0x0A: ("B", 1, 0x00), 0x8B: ("H", 2, 0x0000),
    0x8C: ("I", 4, 0x00000000), 0x0D: ("B", 1, 0xFF), 0x8E: ("q", 8, 0x7FFFFFFFFFFFFFFF),
    0x8F: ("Q", 8, 0xFFFFFFFFFFFFFFFF), 0x90: ("Q", 8, 0),
}

SESSION, LAP, RECORD, EVENT, TIME_IN_ZONE = 18, 19, 20, 21, 216


class FitError(Exception):
    pass


def _decode(data: bytes):
    """→ список (global_num, {field_num: value | [values]}) в порядке файла."""
    if len(data) < 12:
        raise FitError("слишком короткий файл")
    hsize = data[0]
    if data[8:12] != b".FIT":
        raise FitError("это не FIT")
    size = struct.unpack_from("<I", data, 4)[0]
    pos, end = hsize, min(len(data), hsize + size)
    defs: dict = {}
    out = []
    last_ts = None
    while pos < end:
        h = data[pos]
        pos += 1
        if h & 0x80:  # сжатый заголовок времени
            local = (h >> 5) & 0x03
            offset = h & 0x1F
            d = defs.get(local)
            if d is None:
                raise FitError("нет определения")
            values, pos = _read(data, pos, d)
            if last_ts is not None:
                ts = (last_ts & ~0x1F) + offset
                if ts < last_ts:
                    ts += 0x20
                values[253] = ts
                last_ts = ts
            out.append((d["num"], values))
            continue
        local = h & 0x0F
        if h & 0x40:  # определение
            arch = data[pos + 1]
            endian = ">" if arch == 1 else "<"
            num = struct.unpack_from(endian + "H", data, pos + 2)[0]
            nf = data[pos + 4]
            pos += 5
            fields = []
            for _ in range(nf):
                fields.append((data[pos], data[pos + 1], data[pos + 2]))
                pos += 3
            dev = 0
            if h & 0x20:
                nd = data[pos]
                pos += 1
                dev = sum(data[pos + 3 * i + 1] for i in range(nd))
                pos += 3 * nd
            defs[local] = {"num": num, "endian": endian, "fields": fields, "dev": dev}
        else:
            d = defs.get(local)
            if d is None:
                raise FitError("нет определения")
            values, pos = _read(data, pos, d)
            if 253 in values and isinstance(values[253], int):
                last_ts = values[253]
            out.append((d["num"], values))
    return out


def _read(data: bytes, pos: int, d: dict):
    values = {}
    e = d["endian"]
    for fnum, size, btype in d["fields"]:
        code, bsize, invalid = BASE.get(btype & 0x9F if btype not in BASE else btype, ("B", 1, None))
        raw = data[pos:pos + size]
        pos += size
        if code == "s":
            values[fnum] = raw.split(b"\x00")[0].decode("utf-8", "replace")
            continue
        n = size // bsize if bsize else 0
        if n == 0:
            continue
        try:
            vals = list(struct.unpack(e + code * n, raw[: n * bsize]))
        except struct.error:
            continue
        vals = [None if (invalid is not None and v == invalid) else v for v in vals]
        values[fnum] = vals[0] if n == 1 else vals
    pos += d["dev"]
    return values, pos


def _s(v, scale=1.0, offset=0.0):
    return None if v is None or isinstance(v, list) else v / scale - offset


def _iso(fit_ts):
    return None if fit_ts is None else datetime.fromtimestamp(fit_ts + FIT_EPOCH, timezone.utc).isoformat().replace("+00:00", "Z")


def parse(data: bytes) -> dict:
    """FIT → документ подробностей тренировки (см. agent.DETAIL_DOC)."""
    msgs = _decode(data)
    sessions = [v for n, v in msgs if n == SESSION]
    laps_raw = [v for n, v in msgs if n == LAP]
    records = [v for n, v in msgs if n == RECORD and v.get(253) is not None]
    events = [v for n, v in msgs if n == EVENT]
    zones_raw = [v for n, v in msgs if n == TIME_IN_ZONE]
    s = sessions[0] if sessions else {}
    start = s.get(2) or (records[0][253] if records else None)
    sport = s.get(5)
    running = sport in (1, 11)  # бег, ходьба: каденс в FIT — на одну ногу

    def spm(cad, frac=None):
        if cad is None:
            return None
        return round((cad + (frac or 0) / 128) * (2 if running else 1), 1)

    def speed(v_enh, v):
        return _s(v_enh, 1000) if v_enh is not None else _s(v, 1000)

    summary = {
        "startedAt": _iso(start),
        "elapsedSec": _s(s.get(7), 1000),
        "timerSec": _s(s.get(8), 1000),
        "distanceM": _s(s.get(9), 100),
        "calories": s.get(11),
        "avgSpeed": speed(s.get(124), s.get(14)),
        "maxSpeed": speed(s.get(125), s.get(15)),
        "avgHr": s.get(16),
        "maxHr": s.get(17),
        "avgCadence": spm(s.get(18), s.get(92)),
        "maxCadence": spm(s.get(19)),
        "avgPower": s.get(20),
        "maxPower": s.get(21),
        "ascentM": s.get(22),
        "descentM": s.get(23),
        "aerobicTE": _s(s.get(24), 10),
        "anaerobicTE": _s(s.get(137), 10),
        "avgVerticalOscillationCm": _s(s.get(89), 100),
        "avgStanceTimeMs": _s(s.get(91), 10),
        "avgVerticalRatio": _s(s.get(132), 100),
        "avgStrideM": _s(s.get(134), 10000),
        "sport": sport,
    }
    if summary["elapsedSec"] is not None and start is not None:
        summary["endedAt"] = _iso(start + round(summary["elapsedSec"]))

    laps = []
    for i, lp in enumerate(laps_raw):
        st = lp.get(2)
        laps.append({
            "group": "recorded",
            "index": i + 1,
            "startOffsetSec": (st - start) if (st is not None and start is not None) else None,
            "timerSec": _s(lp.get(8), 1000),
            "elapsedSec": _s(lp.get(7), 1000),
            "distanceM": _s(lp.get(9), 100),
            "avgSpeed": speed(lp.get(110), lp.get(13)),
            "avgHr": lp.get(15),
            "maxHr": lp.get(16),
            "avgCadence": spm(lp.get(17)),
            "maxCadence": spm(lp.get(18)),
            "avgPower": lp.get(19),
            "maxPower": lp.get(20),
            "ascentM": lp.get(21),
            "descentM": lp.get(22),
            "calories": lp.get(11),
        })

    cols = {k: [] for k in ("t", "dist", "speed", "hr", "alt", "cad", "pow", "lat", "lon", "vo", "gct", "vr", "stride")}
    t0 = start if start is not None else (records[0][253] if records else 0)
    for r in records:
        cols["t"].append(r[253] - t0)
        cols["dist"].append(_s(r.get(5), 100))
        cols["speed"].append(speed(r.get(73), r.get(6)))
        cols["hr"].append(r.get(3))
        alt = r.get(78) if r.get(78) is not None else r.get(2)
        cols["alt"].append(None if alt is None else round(alt / 5 - 500, 1))
        cols["cad"].append(spm(r.get(4), r.get(53)))
        cols["pow"].append(r.get(7))
        lat, lon = r.get(0), r.get(1)
        cols["lat"].append(None if lat is None else round(lat * 180 / 2**31, 6))
        cols["lon"].append(None if lon is None else round(lon * 180 / 2**31, 6))
        cols["vo"].append(_s(r.get(39), 100))
        cols["gct"].append(_s(r.get(41), 10))
        cols["vr"].append(_s(r.get(83), 100))
        cols["stride"].append(_s(r.get(85), 10000))
    # Паузы: событие таймера (0) stop / stop_all → start.
    pauses, stopped = [], None
    for ev in events:
        if ev.get(0) != 0 or ev.get(253) is None:
            continue
        typ = ev.get(1)
        if typ in (1, 4, 9) and stopped is None:
            stopped = ev[253]
        elif typ == 0 and stopped is not None:
            pauses.append([stopped - t0, ev[253] - t0])
            stopped = None
    # Активное время каждой точки (без пауз) — для темпа и отрезков, как у часов.
    tt = []
    for x in cols["t"]:
        paused = sum(max(0, min(x, b) - a) for a, b in pauses)
        tt.append(x - paused)
    cols["tt"] = tt
    streams = {k: v for k, v in cols.items() if k in ("t", "tt") or any(x is not None for x in v)}

    zones = []
    for z in zones_raw:
        if z.get(0) != SESSION:
            continue
        times = z.get(2)
        bounds = z.get(6)
        if isinstance(times, list) and times:
            zones.append({
                "metric": "hr",
                "seconds": [None if v is None else v / 1000 for v in times],
                "upperBounds": bounds if isinstance(bounds, list) else None,
                "origin": "recorded",
            })

    return {
        "summary": {k: v for k, v in summary.items() if v is not None},
        "laps": laps,
        "streams": streams,
        "pauses": pauses,
        "zones": zones,
        "parser": "repeat-fit/1",
    }


def splits(streams: dict, step_m: float, group: str) -> list:
    """Отрезки по дистанции (1 км, 5 км…) из рядов — отдельное представление, не круги."""
    t = streams.get("tt") or streams.get("t") or []
    dist = streams.get("dist") or []
    hr = streams.get("hr") or [None] * len(t)
    out, start_i, mark = [], 0, step_m
    for i, d in enumerate(dist):
        if d is None:
            continue
        last = i == len(dist) - 1
        if d >= mark or last:
            seg_hr = [h for h in hr[start_i:i + 1] if h is not None]
            d0 = dist[start_i] or 0
            out.append({
                "group": group,
                "index": len(out) + 1,
                "timerSec": t[i] - t[start_i],
                "distanceM": round(d - d0, 1),
                "avgHr": round(sum(seg_hr) / len(seg_hr)) if seg_hr else None,
                "partial": d < mark,
            })
            start_i = i
            mark += step_m
    return [x for x in out if x["distanceM"] > 0]
