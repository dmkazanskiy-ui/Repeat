// «Итог дня» на главной: живая карточка, которая окрашивается тем, что было
// за день. Каждый вид — своё цветное пятно (силовая — фиолетовый, бег —
// розовый, вело — жёлтый, плавание — бирюзовый…), пятна смешиваются, и чем
// больше сделано, тем насыщеннее. Сверху — переключатель «День · Силовая ·
// Бег · Вело…», листается и свайпом: у каждого вида свой экран с крупной
// цифрой и своим графиком (бары упражнений, кольцо времени к цели плана).
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { radius } from "../ui";
import { CARD_IN } from "../theme";
import { ink, MODE } from "../lib/themeMode";
import { useT } from "../lib/i18n";
import { formatDistance, formatPace, formatVolume, weekGrid } from "../lib/format";
import { sessionsOn } from "../lib/store";
import { daySummary } from "../lib/analytics";
import { countedSession, exerciseName, sessionAvgHr, sessionDurationSec, sessionVolume } from "../lib/types";
import type { Exercise, PlannedSession, Session } from "../lib/types";

type Group = "strength" | "run" | "bike" | "swim" | "walk" | "cardio" | "wod" | "mobility" | "recovery";

const ORDER: Group[] = ["strength", "wod", "run", "bike", "swim", "walk", "cardio", "mobility", "recovery"];
const COLOR: Record<Group, string> = {
  strength: ink("#a78bfa"),
  wod: ink("#fb923c"),
  run: ink("#f472b6"),
  bike: ink("#facc15"),
  swim: ink("#22d3ee"),
  walk: ink("#2dd4bf"),
  cardio: ink("#f472b6"),
  mobility: ink("#4ade80"),
  recovery: ink("#38bdf8"),
};

function groupOf(s: { kind: Session["kind"]; cardioKind?: Session["cardioKind"] }): Group {
  if (s.kind !== "cardio") return s.kind;
  if (s.cardioKind === "run" || s.cardioKind === "treadmill_run") return "run";
  if (s.cardioKind === "bike") return "bike";
  if (s.cardioKind === "swim") return "swim";
  if (s.cardioKind === "treadmill") return "walk";
  return "cardio";
}

/** Минуты активности; у силовой без таймера — ~3 мин на подход. */
function minutesOf(s: Session): number {
  if (s.kind === "recovery") return s.recovery?.durationMin ?? 0;
  const sec = s.cardio?.durationSec ?? sessionDurationSec(s);
  if (sec) return sec / 60;
  if (s.kind === "strength") return countedSession(s).exercises.reduce((n, e) => n + e.sets.filter((x) => !x.warmup).length, 0) * 3;
  return 0;
}

interface Props {
  dayList: Session[];
  allSessions: Session[];
  selected: string;
  exercises: Exercise[];
  /** Карточки плана дня — цель для кольца времени. */
  planned?: PlannedSession[];
}

export default function DayHero({ dayList, allSessions, selected, exercises, planned = [] }: Props) {
  const t = useT();
  const theme = useTheme();
  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  const groups = useMemo(() => {
    const by = new Map<Group, Session[]>();
    for (const s of dayList) by.set(groupOf(s), [...(by.get(groupOf(s)) ?? []), s]);
    return ORDER.filter((g) => by.has(g)).map((g) => ({ g, list: by.get(g)! }));
  }, [dayList]);
  const pages = [{ key: "day" as const }, ...groups.map((x) => ({ key: x.g }))];

  // Новый день — снова на «День».
  useEffect(() => {
    setPage(0);
    scroller.current?.scrollTo({ left: 0 });
  }, [selected]);

  function go(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  // Пятна цвета: по одному на вид, сила — от доли времени и числа тренировок.
  const totalMin = Math.max(1, groups.reduce((a, x) => a + x.list.reduce((m, s) => m + Math.max(minutesOf(s), 10), 0), 0));
  const spots = [
    ["12% 0%", "90% 110%"],
    ["100% 0%", "80% 90%"],
    ["0% 100%", "80% 80%"],
    ["90% 100%", "70% 80%"],
    ["50% 50%", "60% 60%"],
  ];
  const strength = MODE === "light" ? 0.55 : 1;
  const active = pages[page]?.key ?? "day";
  const bg = groups
    .slice(0, 5)
    .map(({ g, list }, i) => {
      const share = list.reduce((m, s) => m + Math.max(minutesOf(s), 10), 0) / totalMin;
      const a = Math.min(0.62, (0.2 + 0.28 * share + 0.07 * (list.length - 1) + 0.04 * (dayList.length - 1)) * strength);
      return `radial-gradient(${spots[i][1]} at ${spots[i][0]}, ${alpha(COLOR[g], a)}, transparent 70%)`;
    })
    .join(", ");

  return (
    <Box
      sx={{
        position: "relative",
        mb: 1.5,
        borderRadius: radius.card,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
        animation: CARD_IN,
        bgcolor: "background.paper",
        // На экране вида его цвет выходит вперёд, на «Дне» — все виды вместе.
        backgroundImage: [active !== "day" ? `radial-gradient(120% 100% at 0% 0%, ${alpha(COLOR[active], MODE === "light" ? 0.22 : 0.38)}, transparent 65%)` : "", bg].filter(Boolean).join(", ") || "none",
        transition: "background-image .4s ease",
      }}
    >
      {/* Переключатель видов */}
      {pages.length > 1 && (
        <Box sx={{ display: "flex", gap: 0.75, px: 2, pt: 1.75, overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          {pages.map((p, i) => {
            const on = i === page;
            const c = p.key === "day" ? theme.palette.text.primary : COLOR[p.key];
            return (
              <ButtonBase
                key={p.key}
                onClick={() => go(i)}
                sx={{
                  flex: "none",
                  px: 1.25,
                  height: 28,
                  borderRadius: 14,
                  fontSize: 13,
                  fontWeight: 700,
                  color: on ? (p.key === "day" ? theme.palette.background.paper : "#0b0f14") : "text.primary",
                  bgcolor: on ? c : alpha(theme.palette.text.primary, 0.08),
                  transition: "background-color .25s ease, color .25s ease",
                  display: "flex",
                  gap: 0.75,
                }}
              >
                {p.key !== "day" && !on && <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: c }} />}
                {groupLabel(p.key, t)}
              </ButtonBase>
            );
          })}
        </Box>
      )}

      <Box
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== page) setPage(i);
        }}
        sx={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
      >
        <Page>
          <DayPage dayList={dayList} allSessions={allSessions} selected={selected} />
        </Page>
        {groups.map(({ g, list }) => (
          <Page key={g}>
            {g === "strength" ? (
              <StrengthPage list={list} exercises={exercises} color={COLOR[g]} />
            ) : (
              <TimePage g={g} list={list} color={COLOR[g]} planned={planned.filter((p) => groupOf(p) === g)} dayMinutes={dayList.reduce((a, s) => a + minutesOf(s), 0)} label={groupLabel(g, t)} />
            )}
          </Page>
        ))}
      </Box>

      {pages.length > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", gap: 0.75, pb: 1.25 }} aria-hidden>
          {pages.map((p, i) => (
            <Box
              key={p.key}
              sx={{
                width: i === page ? 16 : 6,
                height: 6,
                borderRadius: 3,
                bgcolor: i === page ? (active === "day" ? "text.primary" : COLOR[active as Group]) : alpha(theme.palette.text.primary, 0.25),
                transition: "width .25s ease, background-color .25s ease",
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function groupLabel(g: Group | "day", t: ReturnType<typeof useT>): string {
  return {
    day: t("День", "Day"),
    strength: t("Силовая", "Strength"),
    wod: t("Задание", "WOD"),
    run: t("Бег", "Run"),
    bike: t("Вело", "Bike"),
    swim: t("Плавание", "Swim"),
    walk: t("Ходьба", "Walk"),
    cardio: t("Кардио", "Cardio"),
    mobility: t("Мобилити", "Mobility"),
    recovery: t("Восстановление", "Recovery"),
  }[g];
}

// ───────────── Сетка страницы ─────────────
//
// Все страницы — один шаблон, как циферблат часов: данные всегда на своих местах.
//
//   подпись                         ┌──────┐
//   ГЛАВНОЕ ЧИСЛО ед.               │визуал│  88×88: бары / кольцо
//                                   └──────┘
//   ─────────────────────────────────────────
//   метрика      метрика      метрика          три равные колонки
//   значение ед. значение ед. значение ед.
//   сноска в одну строку
//
// Шкала: подпись 12/600, главное 34/800, единица 15/700, метрика 17/700 с
// подписью 12/500, сноска 12/500. Цифры моноширинные (tabular-nums), единица
// всегда мельче числа и на одной базовой линии.

const VIS = 88;
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' } as const;

/** «7 650 кг» → ["7 650", "кг"], «6:09/км» → ["6:09", "/км"], «3 тренировки» → ["3", "тренировки"]. */
function split(text: string): [string, string] {
  const m = text.match(/^([\d\s.,:–-]+?)\s?((?:\/|[^\d\s.,:]).*)$/);
  return m ? [m[1].trim(), m[2].trim()] : [text, ""];
}

interface Stat {
  label: string;
  value: string | null;
}

function Page({ children }: { children: React.ReactNode }) {
  return <Box sx={{ flex: "0 0 100%", minWidth: 0, scrollSnapAlign: "start", px: 2, pt: 1.5, pb: 1.5 }}>{children}</Box>;
}

function Value({ text, size, unitSize, fit }: { text: string; size: number; unitSize: number; fit?: boolean }) {
  const [num, unit] = split(text);
  const chars = num.length + unit.length * 0.75;
  return (
    <Box sx={{ containerType: fit ? "inline-size" : undefined, minWidth: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.22em",
          whiteSpace: "nowrap",
          lineHeight: 1,
          fontSize: fit ? `clamp(22px, calc(100cqi / ${(Math.max(3, chars) * 0.6).toFixed(2)}), ${size}px)` : size,
        }}
      >
        <Box component="span" sx={{ fontWeight: 800, letterSpacing: "-0.02em", ...NUM }}>
          {num}
        </Box>
        {unit && (
          <Box component="span" sx={{ fontSize: `${(unitSize / size).toFixed(3)}em`, fontWeight: 700, color: "text.secondary" }}>
            {unit}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Layout({ eyebrow, value, visual, stats, foot }: { eyebrow: string; value: string; visual: React.ReactNode; stats: Stat[]; foot?: string }) {
  const theme = useTheme();
  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${VIS}px`, columnGap: 2, alignItems: "center", minHeight: VIS }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", lineHeight: "16px", mb: 0.75 }} noWrap>
            {eyebrow}
          </Typography>
          <Value text={value} size={34} unitSize={15} fit />
        </Box>
        <Box sx={{ width: VIS, height: VIS, display: "grid", placeItems: "center" }}>{visual}</Box>
      </Box>
      <Box sx={{ height: "1px", bgcolor: alpha(theme.palette.text.primary, 0.1), my: 1.5 }} />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 1.5 }}>
        {stats.slice(0, 3).map((st) => (
          <Box key={st.label} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", lineHeight: "16px", mb: 0.5 }} noWrap>
              {st.label}
            </Typography>
            {st.value ? <Value text={st.value} size={17} unitSize={12} /> : <Box sx={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: "text.disabled" }}>—</Box>}
          </Box>
        ))}
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", lineHeight: "16px", mt: 1.25, minHeight: 16 }} noWrap>
        {foot ?? ""}
      </Typography>
    </Box>
  );
}

const km = (m: number, kind: Session["cardioKind"]) => (m > 0 ? formatDistance(m, kind) : null);
const fmtMin = (m: number, t: ReturnType<typeof useT>) => (m > 0 ? `${Math.round(m)} ${t("мин", "min")}` : null);

/** «День»: сколько тренировок, неделя столбиками — в каждом столбике виды дня по цветам. */
function DayPage({ dayList, allSessions, selected }: { dayList: Session[]; allSessions: Session[]; selected: string }) {
  const t = useT();
  const theme = useTheme();
  const sum = daySummary(dayList);
  const week = weekGrid(selected);
  const days = week.map((d) => {
    const by = new Map<Group, number>();
    for (const s of sessionsOn(allSessions, d)) by.set(groupOf(s), (by.get(groupOf(s)) ?? 0) + Math.max(minutesOf(s), 8));
    return { d, parts: ORDER.filter((g) => by.has(g)).map((g) => ({ g, m: by.get(g)! })) };
  });
  const max = Math.max(1, ...days.map((x) => x.parts.reduce((a, p) => a + p.m, 0)));
  const minutes = dayList.reduce((a, s) => a + minutesOf(s), 0);
  const weekCount = week.reduce((a, d) => a + sessionsOn(allSessions, d).length, 0);
  const weekMin = days.reduce((a, x) => a + x.parts.reduce((b, p) => b + p.m, 0), 0);

  return (
    <Layout
      eyebrow={t("Итог дня", "Day summary")}
      value={sum.shortHeadline}
      stats={[
        { label: t("Активность", "Active"), value: fmtMin(minutes, t) },
        { label: t("Тоннаж", "Tonnage"), value: sum.tonnage > 0 ? formatVolume(sum.tonnage) : null },
        { label: t("Дистанция", "Distance"), value: km(sum.distanceM, null) },
      ]}
      foot={t(`Неделя: ${weekCount} трен. · ${Math.round(weekMin)} мин`, `Week: ${weekCount} workouts · ${Math.round(weekMin)} min`)}
      visual={
        <Box sx={{ width: VIS, height: VIS, display: "flex", alignItems: "flex-end", gap: "3px" }} aria-hidden>
          {days.map(({ d, parts }) => {
            const total = parts.reduce((a, p) => a + p.m, 0);
            const on = d === selected;
            let acc = 0;
            const stops = parts.flatMap((p) => {
              const a = (acc / total) * 100;
              acc += p.m;
              return [`${COLOR[p.g]} ${a.toFixed(0)}%`, `${COLOR[p.g]} ${((acc / total) * 100).toFixed(0)}%`];
            });
            return (
              <Box key={d} sx={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", opacity: on ? 1 : 0.45 }}>
                <Box
                  sx={{
                    height: total ? `${Math.max(8, (total / max) * 100)}%` : 4,
                    borderRadius: "4px",
                    background: total ? (parts.length === 1 ? COLOR[parts[0].g] : `linear-gradient(to top, ${stops.join(", ")})`) : alpha(theme.palette.text.primary, 0.18),
                  }}
                />
              </Box>
            );
          })}
        </Box>
      }
    />
  );
}

/** Силовая: тоннаж, бары по упражнениям. */
function StrengthPage({ list, exercises, color }: { list: Session[]; exercises: Exercise[]; color: string }) {
  const t = useT();
  const per = new Map<string, number>();
  let sets = 0;
  let reps = 0;
  for (const s of list) {
    for (const e of countedSession(s).exercises) {
      const work = e.sets.filter((x) => !x.warmup);
      per.set(e.exerciseId, (per.get(e.exerciseId) ?? 0) + work.reduce((a, x) => a + (x.weight ?? 0) * (x.reps ?? 0), 0));
      sets += work.length;
      reps += work.reduce((a, x) => a + (x.reps ?? 0), 0);
    }
  }
  const vol = list.reduce((a, s) => a + sessionVolume(s), 0);
  const bars = [...per.entries()];
  const max = Math.max(1, ...bars.map(([, v]) => v));
  const top = bars.slice().sort((a, b) => b[1] - a[1])[0];
  return (
    <Layout
      eyebrow={t("Силовая · тоннаж", "Strength · tonnage")}
      value={vol > 0 ? formatVolume(vol) : "—"}
      stats={[
        { label: t("Упражнения", "Exercises"), value: bars.length ? String(bars.length) : null },
        { label: t("Подходы", "Sets"), value: sets ? String(sets) : null },
        { label: t("Повторы", "Reps"), value: reps ? String(reps) : null },
      ]}
      foot={top && top[1] > 0 ? t(`Больше всего — ${exerciseName(exercises.find((e) => e.id === top[0]))}`, `Most volume — ${exerciseName(exercises.find((e) => e.id === top[0]))}`) : undefined}
      visual={
        <Box sx={{ width: VIS, height: VIS, display: "flex", alignItems: "flex-end", gap: "3px" }} aria-hidden>
          {bars.slice(0, 10).map(([id, v]) => (
            <Box key={id} sx={{ flex: 1, height: `${Math.max(8, (v / max) * 100)}%`, borderRadius: "4px", background: `linear-gradient(to top, ${alpha(color, 0.5)}, ${color})` }} />
          ))}
        </Box>
      }
    />
  );
}

/** Кардио, мобилити, восстановление: минуты, кольцо — к цели плана или доля дня. */
function TimePage({ g, list, color, planned, dayMinutes, label }: { g: Group; list: Session[]; color: string; planned: PlannedSession[]; dayMinutes: number; label: string }) {
  const t = useT();
  const theme = useTheme();
  const minutes = list.reduce((a, s) => a + minutesOf(s), 0);
  const goal = planned.reduce((a, p) => a + (p.durationMaxMin != null && p.durationMin != null ? (p.durationMin + p.durationMaxMin) / 2 : (p.durationMin ?? 0)), 0);
  const share = goal > 0 ? Math.min(1, minutes / goal) : dayMinutes > 0 ? Math.min(1, minutes / dayMinutes) : 0;
  const dist = list.reduce((a, s) => a + (s.cardio?.distanceM ?? 0), 0);
  const sec = list.reduce((a, s) => a + (s.cardio?.durationSec ?? sessionDurationSec(s) ?? 0), 0);
  const hrs = list.map(sessionAvgHr).filter((x): x is number => x != null);
  const hr = hrs.length ? `${Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)} ${t("уд/мин", "bpm")}` : null;
  const kcalN = list.reduce((a, s) => a + (s.calories ?? s.caloriesEst ?? 0), 0);
  const kcal = kcalN > 0 ? `${Math.round(kcalN)} ${t("ккал", "kcal")}` : null;
  const kind = list[0]?.cardioKind ?? null;
  const pace = dist > 0 && sec > 0 ? formatPace(dist, sec, kind) : null;
  const speed = dist > 0 && sec > 0 ? `${((dist / sec) * 3.6).toFixed(1).replace(".", t(",", "."))} ${t("км/ч", "km/h")}` : null;
  const inc = list.map((s) => s.cardio?.inclineDeg).filter((x): x is number => x != null);
  const heat = list.filter((s) => s.recovery && ["sauna", "banya", "steam", "hot_bath"].includes(s.recovery.type)).reduce((a, s) => a + (s.recovery?.durationMin ?? 0), 0);
  const cold = list.filter((s) => s.recovery && ["cold_plunge", "ice_bath", "cold_shower", "contrast"].includes(s.recovery.type)).reduce((a, s) => a + (s.recovery?.durationMin ?? 0), 0);

  const stats: Stat[] =
    g === "run" || g === "swim"
      ? [{ label: t("Дистанция", "Distance"), value: km(dist, kind) }, { label: t("Темп", "Pace"), value: pace }, { label: t("Пульс", "HR"), value: hr }]
      : g === "bike"
        ? [{ label: t("Дистанция", "Distance"), value: km(dist, kind) }, { label: t("Скорость", "Speed"), value: speed }, { label: t("Пульс", "HR"), value: hr }]
        : g === "walk"
          ? [{ label: t("Дистанция", "Distance"), value: km(dist, kind) }, { label: t("Наклон", "Incline"), value: inc.length ? `${Math.max(...inc)}°` : null }, { label: t("Пульс", "HR"), value: hr }]
          : g === "recovery"
            ? [{ label: t("Процедуры", "Sessions"), value: String(list.length) }, { label: t("Тепло", "Heat"), value: fmtMin(heat, t) }, { label: t("Холод", "Cold"), value: fmtMin(cold, t) }]
            : [{ label: t("Дистанция", "Distance"), value: km(dist, kind) }, { label: t("Пульс", "HR"), value: hr }, { label: t("Энергия", "Energy"), value: kcal }];

  const R = 36;
  const C = 2 * Math.PI * R;
  return (
    <Layout
      eyebrow={`${label} · ${t("время", "time")}`}
      value={fmtMin(minutes, t) ?? "—"}
      stats={stats}
      foot={
        goal > 0
          ? minutes >= goal
            ? t(`Цель плана ${Math.round(goal)} мин выполнена`, `Plan goal of ${Math.round(goal)} min reached`)
            : t(`Цель плана ${Math.round(goal)} мин · осталось ${Math.round(goal - minutes)}`, `Plan goal ${Math.round(goal)} min · ${Math.round(goal - minutes)} to go`)
          : t(`${Math.round(share * 100)}% активного времени дня`, `${Math.round(share * 100)}% of the day's active time`)
      }
      visual={
        <Box sx={{ position: "relative", width: VIS, height: VIS }}>
          <svg viewBox={`0 0 ${VIS} ${VIS}`} width={VIS} height={VIS} style={{ transform: "rotate(-90deg)" }} aria-hidden>
            <circle cx={VIS / 2} cy={VIS / 2} r={R} fill="none" stroke={alpha(theme.palette.text.primary, 0.12)} strokeWidth={8} />
            <circle
              cx={VIS / 2}
              cy={VIS / 2}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - share)}
              style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }}
            />
          </svg>
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <Value text={`${Math.round(share * 100)} %`} size={17} unitSize={12} />
          </Box>
        </Box>
      }
    />
  );
}
