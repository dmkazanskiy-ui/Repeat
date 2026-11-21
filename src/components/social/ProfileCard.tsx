// Profile card (designbookmark.com/motion#db-profile-card) на наших пружинах.
// «Подписаться» одной пружиной 300/22 переходит в «Вы подписаны»: белая заливка
// гаснет, подпись меняется с лёгким сдвигом, аватар подпрыгивает (520/14),
// а число подписчиков прокручивается барабанами по цифрам (260/22, перенос
// с задержкой 60 мс). Кнопки «Написать» пока нет — мессенджеров в Repeat нет.
import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Card, radius } from "../../ui";
import Avatar from "./Avatar";
import { clamp, spring, springLoop, type Spring } from "../../lib/spring";
import { haptic } from "../../lib/telegram";
import { ACTIVITIES } from "../../lib/social";
import type { PublicProfile } from "../../lib/social";
import { useLang, useT } from "../../lib/i18n";

const FOLLOW: [number, number] = [300, 22];
const POP: [number, number] = [520, 14];
const DRUM: [number, number] = [260, 22];

/** Число барабанами: каждая цифра — столбик 0…9 на своей пружине. */
function DrumNumber({ value }: { value: number }) {
  const digits = String(Math.max(0, value)).split("").map(Number);
  const colRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const st = useRef<{ drums: Spring[]; loop: ReturnType<typeof springLoop> | null; timers: number[] }>({ drums: [], loop: null, timers: [] });
  const len = digits.length;

  useEffect(() => {
    const s = st.current;
    s.drums = digits.map((d) => spring(d, ...DRUM));
    s.loop = springLoop(
      () => s.drums,
      () =>
        s.drums.forEach((d, i) => {
          const m = ((d.x % 10) + 10) % 10;
          const el = colRefs.current[i];
          if (el) el.style.transform = `translateY(${((-m * 100) / 11).toFixed(3)}%)`;
        }),
    );
    s.loop.kick();
    return () => {
      s.loop?.stop();
      s.timers.forEach(clearTimeout);
    };
    // Длина числа поменялась — пересобираем барабаны.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [len]);

  useEffect(() => {
    const s = st.current;
    digits.forEach((d, k) => {
      // Младшие разряды трогаются первыми — перенос «бежит» влево.
      s.timers.push(
        window.setTimeout(() => {
          const drum = s.drums[k];
          if (!drum) return;
          const cur = Math.round(drum.t);
          let diff = (((d - cur) % 10) + 10) % 10;
          if (diff > 5) diff -= 10; // короткой дорогой: 9 → 0 едет вперёд
          drum.t = cur + diff;
          s.loop?.kick();
        }, (digits.length - 1 - k) * 60),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Box component="b" sx={{ display: "inline-flex", lineHeight: "1.25em", fontWeight: 700, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
      {digits.map((_, i) => (
        <Box key={`${len}-${i}`} component="span" sx={{ display: "inline-block", height: "1.25em", overflow: "hidden" }}>
          <Box
            component="span"
            ref={(el: HTMLSpanElement | null) => {
              colRefs.current[i] = el;
            }}
            sx={{ display: "block", willChange: "transform" }}
          >
            {Array.from({ length: 11 }, (_, k) => (
              <Box key={k} component="i" sx={{ display: "block", height: "1.25em", fontStyle: "normal" }}>
                {k % 10}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default function ProfileCard({
  profile,
  onFollow,
  onEdit,
}: {
  profile: PublicProfile;
  onFollow: (on: boolean) => Promise<PublicProfile>;
  onEdit: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [on, setOn] = useState(profile.followed);
  const [followers, setFollowers] = useState(profile.followers);
  const bgRef = useRef<HTMLSpanElement>(null);
  const aRef = useRef<HTMLSpanElement>(null);
  const bRef = useRef<HTMLSpanElement>(null);
  const avRef = useRef<HTMLDivElement>(null);
  const st = useRef({ f: spring(profile.followed ? 1 : 0, ...FOLLOW), pop: spring(1, ...POP), loop: null as ReturnType<typeof springLoop> | null });

  useEffect(() => {
    const s = st.current;
    const paint = () => {
      const q = clamp(s.f.x, 0, 1);
      if (bgRef.current) bgRef.current.style.opacity = (1 - q).toFixed(3);
      if (aRef.current) {
        aRef.current.style.opacity = (1 - q).toFixed(3);
        aRef.current.style.transform = `translateY(${(-q * 12).toFixed(2)}px)`;
      }
      if (bRef.current) {
        bRef.current.style.opacity = q.toFixed(3);
        bRef.current.style.transform = `translateY(${((1 - q) * 12).toFixed(2)}px)`;
      }
      if (avRef.current) avRef.current.style.transform = `scale(${s.pop.x.toFixed(4)})`;
    };
    s.loop = springLoop(() => [s.f, s.pop], paint);
    paint();
    return () => s.loop?.stop();
  }, []);

  async function toggle() {
    const s = st.current;
    const next = !on;
    setOn(next);
    setFollowers((n) => n + (next ? 1 : -1));
    s.f.t = next ? 1 : 0;
    if (next) {
      s.pop.v = 4;
      haptic("light");
    }
    s.loop?.kick();
    try {
      const r = await onFollow(next);
      setFollowers(r.followers);
    } catch {
      setOn(!next);
      setFollowers((n) => n + (next ? -1 : 1));
      s.f.t = next ? 0 : 1;
      s.loop?.kick();
    }
  }

  const acts = profile.acts.map((a) => ACTIVITIES.find((x) => x.id === a)).filter(Boolean).map((m) => (lang === "ru" ? m!.ru : m!.en));
  const plural = (n: number, ru: [string, string, string], en: string) => {
    if (lang !== "ru") return en;
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? ru[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ru[1] : ru[2];
  };

  return (
    <Card sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box ref={avRef} sx={{ willChange: "transform", flex: "none" }}>
          <Avatar person={profile} size={52} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 16, fontWeight: 700, lineHeight: "21px" }}>
            {profile.name}
          </Typography>
          {acts.length > 0 && (
            <Typography noWrap sx={{ fontSize: 13, lineHeight: "18px", color: "text.secondary" }}>
              {acts.join(" · ")}
            </Typography>
          )}
        </Box>
      </Box>

      {profile.bio && <Typography sx={{ my: 1.75, fontSize: 14, lineHeight: "20px", color: "text.secondary", overflowWrap: "anywhere" }}>{profile.bio}</Typography>}

      <Box sx={{ display: "flex", gap: 2, mt: profile.bio ? 0 : 1.75, fontSize: 13, color: "text.secondary", whiteSpace: "nowrap", flexWrap: "wrap" }}>
        <span>
          <DrumNumber value={followers} /> {plural(followers, ["подписчик", "подписчика", "подписчиков"], "followers")}
        </span>
        <span>
          <b style={{ fontWeight: 700 }}>{profile.following}</b> {plural(profile.following, ["подписка", "подписки", "подписок"], "following")}
        </span>
        <span>
          <b style={{ fontWeight: 700 }}>{profile.posts}</b> {plural(profile.posts, ["тренировка", "тренировки", "тренировок"], "workouts")}
        </span>
      </Box>

      <Box sx={{ position: "relative", height: 40, mt: 2 }}>
        {profile.mine ? (
          <Box
            component="button"
            onClick={onEdit}
            sx={{ position: "absolute", inset: 0, border: 0, borderRadius: radius.pill, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, bgcolor: "action.selected", color: "text.primary" }}
          >
            {t("Изменить профиль", "Edit profile")}
          </Box>
        ) : (
          <Box
            component="button"
            onClick={() => void toggle()}
            aria-pressed={on}
            sx={{ position: "absolute", inset: 0, overflow: "hidden", border: 0, borderRadius: radius.pill, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, bgcolor: "action.selected", color: "text.primary" }}
          >
            <Box component="span" ref={bgRef} sx={{ position: "absolute", inset: 0, bgcolor: "text.primary" }} />
            <Box component="span" ref={aRef} sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "background.default", willChange: "transform,opacity" }}>
              {t("Подписаться", "Follow")}
            </Box>
            <Box component="span" ref={bRef} sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", willChange: "transform,opacity" }}>
              {t("Вы подписаны", "Following")}
            </Box>
          </Box>
        )}
      </Box>
    </Card>
  );
}
