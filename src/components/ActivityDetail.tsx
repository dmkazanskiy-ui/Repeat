// Подробная статистика тренировки с часов (COROS, Garmin…): сводка, маршрут,
// графики на общей шкале активного времени, зоны и отрезки. Грузится только
// при открытии экрана — в синхронизацию тяжёлые данные не попадают.
// Чего нет в источнике — того нет на экране: ни пустых графиков, ни нулей.
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, CircularProgress, IconButton, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Card, Section, radius } from "../ui";
import Segmented from "../ui/Segmented";
import { ink } from "../lib/themeMode";
import { useT } from "../lib/i18n";
import { clock, fetchDetail, lapPace, minMaxDownsample, pace, type DetailDoc, type DetailLap } from "../lib/activityDetail";
import type { Session } from "../lib/types";

const NUM = { fontVariantNumeric: "tabular-nums" } as const;
const C = {
  pace: ink("#f472b6"),
  hr: ink("#f87171"),
  alt: ink("#2dd4bf"),
  cad: ink("#a78bfa"),
  pow: ink("#facc15"),
  gct: ink("#38bdf8"),
};

export default function ActivityDetail({ session }: { session: Session }) {
  const t = useT();
  const src = session.source!;
  const [doc, setDoc] = useState<DetailDoc | null>(null);
  const [state, setState] = useState<"loading" | "error" | "none" | "ok">("loading");
  const load = () => {
    setState("loading");
    fetchDetail(src.provider, src.externalId)
      .then((d) => {
        setDoc(d);
        setState("ok");
      })
      .catch((e: Error) => setState(e.message === "none" ? "none" : "error"));
  };
  useEffect(load, [src.provider, src.externalId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "loading")
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 3 }}>
        <CircularProgress size={22} />
      </Box>
    );
  if (state === "none") return null;
  if (state === "error")
    return (
      <Card sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {t("Подробности не загрузились", "Details failed to load")}
        </Typography>
        <Button size="small" onClick={load}>
          {t("Повторить", "Retry")}
        </Button>
      </Card>
    );
  return <Detail doc={doc!} />;
}

function Detail({ doc }: { doc: DetailDoc }) {
  const t = useT();
  const st = doc.streams ?? null;
  const hasGps = Boolean(st?.lat && st.lat.some((v) => v != null));
  return (
    <Box sx={{ mb: 2 }}>
      <StatsGrid doc={doc} />
      {hasGps && <RouteMap lat={st!.lat as (number | null)[]} lon={st!.lon as (number | null)[]} />}
      {st && (st.tt || st.t) && <Charts doc={doc} />}
      {doc.zones.length > 0 && <Zones doc={doc} />}
      {doc.laps.length > 0 && <Laps laps={doc.laps} />}
      {doc.missing && doc.missing.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          {t("Нет в источнике", "Not in source")}: {doc.missing.join(", ")}
        </Typography>
      )}
    </Box>
  );
}

// ───────────── Сводка ─────────────

function StatsGrid({ doc }: { doc: DetailDoc }) {
  const t = useT();
  const theme = useTheme();
  const [more, setMore] = useState(false);
  const s = doc.summary;
  const n = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : null);
  const items: { label: string; value: string; unit?: string }[] = [];
  const push = (ok: boolean, label: string, value: string, unit?: string) => ok && items.push({ label, value, unit });
  const dist = n("distanceM");
  const timer = n("timerSec");
  push(dist != null && dist > 0, t("Дистанция", "Distance"), dist != null ? (dist / 1000).toFixed(2).replace(".", t(",", ".")) : "", t("км", "km"));
  push(timer != null, t("Активное время", "Active time"), clock(timer));
  push(n("elapsedSec") != null, t("Полное время", "Elapsed"), clock(n("elapsedSec")));
  const avgPace = n("avgPaceSec") ?? (dist && dist > 50 && timer ? timer / (dist / 1000) : null);
  push(avgPace != null, t("Темп", "Pace"), pace(avgPace), "/км");
  push(n("avgHr") != null, t("Пульс", "HR"), `${n("avgHr") ?? "—"} / ${n("maxHr") ?? "—"}`);
  push(n("calories") != null, t("Калории", "Calories"), String(Math.round(n("calories") ?? 0)), t("ккал", "kcal"));
  push(n("movingPaceSec") != null, t("Темп движения", "Moving pace"), pace(n("movingPaceSec")), "/км");
  push(n("effortPaceSec") != null, t("Темп усилия", "Effort pace"), pace(n("effortPaceSec")), "/км");
  push(n("bestKmSec") != null, t("Лучший км", "Best km"), pace(n("bestKmSec")), "/км");
  push(n("avgCadence") != null, t("Каденс", "Cadence"), `${Math.round(n("avgCadence") ?? 0)} / ${n("maxCadence") != null ? Math.round(n("maxCadence")!) : "—"}`, t("шаг/мин", "spm"));
  push(n("avgStrideM") != null, t("Длина шага", "Stride"), (n("avgStrideM") ?? 0).toFixed(2).replace(".", t(",", ".")), t("м", "m"));
  push(n("avgPower") != null, t("Мощность", "Power"), `${n("avgPower")} / ${n("maxPower") ?? "—"}`, t("Вт", "W"));
  push(n("ascentM") != null || n("descentM") != null, t("Набор / спуск", "Gain / loss"), `${n("ascentM") ?? "—"} / ${n("descentM") ?? "—"}`, t("м", "m"));
  push(n("minAltM") != null, t("Высота", "Elevation"), `${n("minAltM")} / ${n("maxAltM") ?? "—"}`, t("м", "m"));
  push(n("trainingLoad") != null, t("Нагрузка", "Load"), String(n("trainingLoad")));
  push(n("aerobicTE") != null, t("Эффект аэр/анаэр", "TE aer/anaer"), `${(n("aerobicTE") ?? 0).toFixed(1)} / ${n("anaerobicTE") != null ? n("anaerobicTE")!.toFixed(1) : "—"}`);
  push(typeof s.trainingFocus === "string", t("Фокус", "Focus"), String(s.trainingFocus ?? ""));
  push(n("efficiencyPct") != null, t("Эффективность", "Efficiency"), `${n("efficiencyPct")}%`);
  push(n("avgStanceTimeMs") != null, t("Контакт с землёй", "Ground contact"), String(Math.round(n("avgStanceTimeMs") ?? 0)), t("мс", "ms"));
  push(n("avgVerticalRatio") != null, t("Верт. соотношение", "Vert. ratio"), (n("avgVerticalRatio") ?? 0).toFixed(1).replace(".", t(",", ".")), "%");
  push(n("avgVerticalOscillationCm") != null, t("Верт. колебания", "Vert. oscillation"), (n("avgVerticalOscillationCm") ?? 0).toFixed(1).replace(".", t(",", ".")), t("см", "cm"));
  const shown = more ? items : items.slice(0, 6);
  return (
    <Card sx={{ mb: 2 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", mb: 1.25 }}>
        {doc.source.toUpperCase()} · {t("статистика часов", "watch stats")}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 1.5, rowGap: 1.5 }}>
        {shown.map((it) => (
          <Box key={it.label} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: "16px", mb: 0.5 }} noWrap>
              {it.label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: "3px", whiteSpace: "nowrap", lineHeight: 1 }}>
              <Box component="span" sx={{ fontSize: 17, fontWeight: 800, ...NUM }}>
                {it.value}
              </Box>
              {it.unit && (
                <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
                  {it.unit}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
      {items.length > 6 && (
        <Button size="small" onClick={() => setMore((v) => !v)} sx={{ mt: 1, ml: -1, color: alpha(theme.palette.text.primary, 0.7) }}>
          {more ? t("Свернуть", "Less") : t(`Ещё ${items.length - 6}`, `${items.length - 6} more`)}
        </Button>
      )}
    </Card>
  );
}

// ───────────── Маршрут ─────────────

const TILE = 256;
const lonX = (lon: number, z: number) => ((lon + 180) / 360) * TILE * 2 ** z;
const latY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z;
};
/** Зона приватности: первые и последние ~250 м трека не рисуем — там часто дом. */
const PRIVACY_PTS = 25;

function RouteMap({ lat, lon }: { lat: (number | null)[]; lon: (number | null)[] }) {
  const t = useT();
  const theme = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [zoomDelta, setZoomDelta] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const pts = useMemo(() => {
    const all = lat.map((la, i) => (la != null && lon[i] != null ? [la, lon[i] as number] : null)).filter(Boolean) as [number, number][];
    return all.length > PRIVACY_PTS * 3 ? all.slice(PRIVACY_PTS, all.length - PRIVACY_PTS) : all;
  }, [lat, lon]);
  const H = 240;
  if (pts.length < 2) return null;
  const minLa = Math.min(...pts.map((p) => p[0]));
  const maxLa = Math.max(...pts.map((p) => p[0]));
  const minLo = Math.min(...pts.map((p) => p[1]));
  const maxLo = Math.max(...pts.map((p) => p[1]));
  let z = 18;
  while (z > 2 && (lonX(maxLo, z) - lonX(minLo, z) > w - 32 || latY(minLa, z) - latY(maxLa, z) > H - 32)) z--;
  z = Math.max(2, Math.min(18, z + zoomDelta));
  const cx = (lonX(minLo, z) + lonX(maxLo, z)) / 2;
  const cy = (latY(minLa, z) + latY(maxLa, z)) / 2;
  const ox = cx - w / 2;
  const oy = cy - H / 2;
  const tiles: { x: number; y: number }[] = [];
  for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++)
    for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + H) / TILE); ty++) tiles.push({ x: tx, y: ty });
  const step = Math.max(1, Math.floor(pts.length / 800));
  const path = pts
    .filter((_, i) => i % step === 0 || i === pts.length - 1)
    .map((p, i) => `${i ? "L" : "M"}${(lonX(p[1], z) - ox).toFixed(1)},${(latY(p[0], z) - oy).toFixed(1)}`)
    .join("");
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dark = theme.palette.mode === "dark";
  return (
    <Section first title={t("Маршрут", "Route")}>
      <Box ref={box} sx={{ position: "relative", height: H, borderRadius: radius.card, overflow: "hidden", border: "1px solid", borderColor: "divider", bgcolor: "action.hover", mb: 2 }}>
        {tiles.map(({ x, y }) => {
          const n = 2 ** z;
          const xx = ((x % n) + n) % n;
          return (
            <Box
              key={`${x}-${y}`}
              component="img"
              alt=""
              draggable={false}
              src={`https://tile.openstreetmap.org/${z}/${xx}/${y}.png`}
              sx={{ position: "absolute", left: x * TILE - ox, top: y * TILE - oy, width: TILE, height: TILE, filter: dark ? "invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)" : "none" }}
            />
          );
        })}
        <svg width={w} height={H} style={{ position: "absolute", inset: 0 }} aria-label={t("Трек пробежки", "Run track")}>
          <path d={path} fill="none" stroke={C.pace} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={lonX(a[1], z) - ox} cy={latY(a[0], z) - oy} r={6} fill="#22c55e" stroke="#fff" strokeWidth={2} />
          <circle cx={lonX(b[1], z) - ox} cy={latY(b[0], z) - oy} r={6} fill="#ef4444" stroke="#fff" strokeWidth={2} />
        </svg>
        <Box sx={{ position: "absolute", right: 8, top: 8, display: "grid", gap: 0.5 }}>
          {[1, -1].map((d) => (
            <IconButton key={d} size="small" aria-label={d > 0 ? t("Приблизить", "Zoom in") : t("Отдалить", "Zoom out")} onClick={() => setZoomDelta((v) => v + d)} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", width: 32, height: 32, fontWeight: 800 }}>
              {d > 0 ? "+" : "−"}
            </IconButton>
          ))}
        </Box>
        <Typography component="a" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" sx={{ position: "absolute", right: 4, bottom: 2, fontSize: 10, color: "text.secondary", bgcolor: alpha(theme.palette.background.paper, 0.8), px: 0.5, borderRadius: "4px", textDecoration: "none" }}>
          © OpenStreetMap
        </Typography>
      </Box>
    </Section>
  );
}

// ───────────── Графики ─────────────

interface Series {
  key: string;
  label: string;
  unit: string;
  color: string;
  values: (number | null)[];
  invert?: boolean;
  /** Среднее из сводки источника (для темпа — по времени и дистанции, не среднее точек). */
  avg?: number;
  fmt: (v: number) => string;
}

function Charts({ doc }: { doc: DetailDoc }) {
  const t = useT();
  const st = doc.streams!;
  const x = (st.tt ?? st.t) as number[];
  const [hover, setHover] = useState<number | null>(null);
  const series: Series[] = [];
  const speed = st.speed;
  const sm = doc.summary;
  const sumPace =
    typeof sm.avgPaceSec === "number" ? sm.avgPaceSec : typeof sm.timerSec === "number" && typeof sm.distanceM === "number" && sm.distanceM > 0 ? sm.timerSec / (sm.distanceM / 1000) : undefined;
  if (speed && speed.some((v) => v != null && v > 0))
    series.push({ key: "pace", label: t("Темп", "Pace"), unit: "/км", color: C.pace, invert: true, avg: sumPace, values: speed.map((v) => (v && v > 0.5 ? 1000 / v : null)), fmt: (v) => pace(v) });
  const add = (key: keyof typeof C, label: string, unit: string, fmt: (v: number) => string) => {
    const v = st[key];
    if (v && v.some((y) => y != null && y !== 0)) series.push({ key, label, unit, color: C[key], values: v, fmt });
  };
  add("hr", t("Пульс", "Heart rate"), t("уд/мин", "bpm"), (v) => String(Math.round(v)));
  add("alt", t("Высота", "Elevation"), t("м", "m"), (v) => v.toFixed(0));
  add("cad", t("Каденс", "Cadence"), t("шаг/мин", "spm"), (v) => String(Math.round(v)));
  add("pow", t("Мощность", "Power"), t("Вт", "W"), (v) => String(Math.round(v)));
  add("gct", t("Контакт с землёй", "Ground contact"), t("мс", "ms"), (v) => String(Math.round(v)));
  if (!series.length) return null;
  const pauses = doc.pauses?.length ?? 0;
  return (
    <Section first title={t("Графики", "Charts")}>
      <Card sx={{ mb: 2, px: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {t("Ось — активное время", "Axis — active time")}
          {pauses ? t(` · паузы вырезаны (${pauses})`, ` · pauses removed (${pauses})`) : ""}
          {hover != null ? ` · ${clock(x[hover])}` : t(" · проведи пальцем по графику", " · drag across a chart")}
        </Typography>
        {series.map((s) => (
          <Chart key={s.key} s={s} x={x} hover={hover} onHover={setHover} />
        ))}
      </Card>
    </Section>
  );
}

function Chart({ s, x, hover, onHover }: { s: Series; x: number[]; hover: number | null; onHover: (i: number | null) => void }) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 72;
  // Статистика — до прореживания.
  const vals = s.values.filter((v): v is number => v != null);
  const sorted = [...vals].sort((a, b) => a - b);
  // Края по 1–99 перцентилю: одна выброшенная точка GPS не сплющивает график.
  const lo = sorted[Math.floor(sorted.length * 0.01)] ?? 0;
  const hi = sorted[Math.ceil(sorted.length * 0.99) - 1] ?? 1;
  const avg = s.avg ?? vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const best = s.invert ? sorted[0] : sorted[sorted.length - 1];
  const xmax = x[x.length - 1] || 1;
  const pts = minMaxDownsample(x, s.values, Math.max(40, Math.floor(w / 2)));
  const yOf = (v: number) => {
    const k = hi === lo ? 0.5 : (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo);
    return 4 + (s.invert ? k : 1 - k) * (H - 8);
  };
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (p.y == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${((p.x / xmax) * w).toFixed(1)},${yOf(p.y).toFixed(1)}`;
    pen = true;
  }
  const hv = hover != null ? s.values[hover] : null;
  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const tx = ((clientX - r.left) / r.width) * xmax;
    let i = 0;
    let lo2 = 0;
    let hi2 = x.length - 1;
    while (lo2 <= hi2) {
      const m = (lo2 + hi2) >> 1;
      if (x[m] < tx) lo2 = m + 1;
      else {
        i = m;
        hi2 = m - 1;
      }
    }
    onHover(i);
  };
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 0.5 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: s.color, flex: "none", alignSelf: "center" }} />
        <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{s.label}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", ...NUM }}>
          {hv != null ? (
            <b style={{ color: theme.palette.text.primary }}>
              {s.fmt(hv)} {s.unit}
            </b>
          ) : (
            <>
              ср {s.fmt(avg)} · {s.invert ? "лучш" : "макс"} {s.fmt(best)} {s.unit}
            </>
          )}
        </Typography>
      </Box>
      <Box
        ref={ref}
        onPointerDown={(e) => move(e.clientX)}
        onPointerMove={(e) => (e.buttons || e.pointerType === "mouse") && move(e.clientX)}
        onPointerLeave={() => onHover(null)}
        sx={{ position: "relative", height: H, touchAction: "pan-y", cursor: "crosshair" }}
      >
        <svg width={w} height={H} style={{ display: "block" }} aria-hidden>
          <path d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" />
          {hover != null && <line x1={(x[hover] / xmax) * w} x2={(x[hover] / xmax) * w} y1={0} y2={H} stroke={theme.palette.text.secondary} strokeDasharray="3 3" />}
        </svg>
      </Box>
    </Box>
  );
}

// ───────────── Зоны ─────────────

function Zones({ doc }: { doc: DetailDoc }) {
  const t = useT();
  const zcolors = ["#94a3b8", "#38bdf8", "#4ade80", "#facc15", "#fb923c", "#f87171", "#e11d48"].map(ink);
  return (
    <Section first title={t("Зоны", "Zones")}>
      {doc.zones.map((z) => {
        const secs = z.seconds.map((v) => v ?? 0);
        const total = secs.reduce((a, b) => a + b, 0) || 1;
        return (
          <Card key={z.metric} sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", mb: 1 }}>
              {z.metric === "hr" ? t("Пульс", "Heart rate") : z.metric === "pace" ? t("Темп", "Pace") : t("Мощность", "Power")}
              {z.origin === "recorded" ? t(" · границы из записи часов", " · bounds recorded by watch") : ""}
            </Typography>
            {secs.map((v, i) => {
              const lo = i > 0 ? z.upperBounds?.[i - 1] : null;
              const hi = z.upperBounds?.[i];
              const pct = Math.round((v / total) * 100);
              return (
                <Box key={i} sx={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 54px 36px", alignItems: "center", gap: 1, mb: 0.75 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{z.names?.[i] ?? `Z${i}`}</Typography>
                  <Box sx={{ height: 10, borderRadius: 5, bgcolor: "action.hover", overflow: "hidden" }}>
                    <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: zcolors[Math.min(i, zcolors.length - 1)], borderRadius: 5 }} />
                  </Box>
                  <Typography sx={{ fontSize: 12, textAlign: "right", ...NUM }}>{clock(v)}</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "right", ...NUM }}>{pct}%</Typography>
                  {(lo != null || hi != null) && z.metric === "hr" && (
                    <Typography sx={{ gridColumn: "2 / -1", fontSize: 11, color: "text.secondary", mt: -0.5, ...NUM }}>
                      {lo != null && hi != null ? `${lo}–${hi}` : hi != null ? `< ${hi}` : `> ${lo}`} {t("уд/мин", "bpm")}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Card>
        );
      })}
    </Section>
  );
}

// ───────────── Отрезки ─────────────

const GROUP_LABEL: Record<string, [string, string]> = {
  recorded: ["Круги", "Laps"],
  km: ["По 1 км", "Per 1 km"],
  km5: ["По 5 км", "Per 5 km"],
  km10: ["По 10 км", "Per 10 km"],
};

function Laps({ laps }: { laps: DetailLap[] }) {
  const t = useT();
  const groups = [...new Set(laps.map((l) => l.group))].sort((a, b) => Object.keys(GROUP_LABEL).indexOf(a) - Object.keys(GROUP_LABEL).indexOf(b));
  const [group, setGroup] = useState(groups[0]);
  const rows = laps.filter((l) => l.group === group).sort((a, b) => a.index - b.index);
  return (
    <Section first title={t("Отрезки", "Splits")}>
      {groups.length > 1 && (
        <Box sx={{ mb: 1 }}>
          <Segmented size="small" fit="content" value={group} onChange={setGroup} options={groups.map((g) => ({ value: g, label: GROUP_LABEL[g] ? t(...GROUP_LABEL[g]) : g }))} />
        </Box>
      )}
      <Card sx={{ p: 0, overflow: "hidden" }}>
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: 13, ...NUM, "& th, & td": { px: 1.25, py: 0.9, textAlign: "right", whiteSpace: "nowrap" }, "& th:first-of-type, & td:first-of-type": { textAlign: "left" }, "& th": { fontSize: 11, fontWeight: 600, color: "text.secondary" }, "& tbody tr:nth-of-type(odd)": { bgcolor: "action.hover" } }}>
            <thead>
              <tr>
                <th>№</th>
                <th>{t("Дист., км", "Dist, km")}</th>
                <th>{t("Время", "Time")}</th>
                <th>{t("Темп", "Pace")}</th>
                <th>{t("Пульс", "HR")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={`${l.group}-${l.index}`}>
                  <td>
                    {l.index}
                    {l.partial ? "*" : ""}
                  </td>
                  <td>{l.distanceM != null ? (l.distanceM / 1000).toFixed(2).replace(".", t(",", ".")) : "—"}</td>
                  <td>{clock(l.timerSec, (l.timerSec ?? 99) < 60)}</td>
                  <td>{pace(lapPace(l))}</td>
                  <td>{l.avgHr ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      </Card>
      {rows.some((r) => r.partial) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {t("* неполный отрезок", "* partial split")}
        </Typography>
      )}
    </Section>
  );
}
