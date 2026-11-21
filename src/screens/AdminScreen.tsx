// Админка владельца: люди, посещения, журнал событий. Видна только тому,
// чей Telegram id сервер закрепил за ADMIN_USERNAME (см. deploy/sync/server.py).
// Содержимое тренировок сюда не приходит — только количества и даты.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { Card, Tile, radius, text } from "../ui";
import { ArrowBack as ArrowBackIcon, Close as CloseIcon } from "../ui/icons";
import { adminFetch } from "../lib/auth";
import PullToRefresh from "../components/PullToRefresh";
import Segmented from "../ui/Segmented";
import { useLang, useT } from "../lib/i18n";
import { ink } from "../lib/themeMode";

interface AdminUser {
  id: string;
  username: string;
  name: string;
  lang: string;
  first: number | null;
  seen: number | null;
  visits: number;
  visits7: number;
  plat: string;
  via: string;
  blocked: boolean;
  admin: boolean;
  webSessions: number;
  size: number;
  records: number;
  workouts: number;
  updated: number | null;
}

interface Overview {
  now: number;
  users: AdminUser[];
  daily: { d: string; visits: number; users: number }[];
  bot: { username: string | null; polling: string };
}

interface AdminEvent {
  t: number;
  e: string;
  uid?: string;
  p?: string;
  d?: string;
}

type View = "people" | "visits" | "log";
type LogFilter = "all" | "visit" | "auth" | "admin" | "problems";

const GREEN = ink("#4ade80");
const AMBER = ink("#f59e0b");
const RED = ink("#f87171");

const FILTERS: Record<LogFilter, (e: AdminEvent) => boolean> = {
  all: () => true,
  visit: (e) => e.e === "visit" || e.e === "new_user",
  auth: (e) => ["login_web", "logout", "login_blocked", "account_deleted"].includes(e.e),
  admin: (e) => e.e === "admin" || e.e === "admin_pinned",
  problems: (e) => ["quota", "bot_conflict", "login_blocked"].includes(e.e),
};

export default function AdminScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [view, setView] = useState<View>("people");
  const [data, setData] = useState<Overview | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [prevIds, setPrevIds] = useState<Set<string> | null>(null);
  const [lastLook, setLastLook] = useState<number | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const dataRef = useRef<Overview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, ev] = await Promise.all([adminFetch<Overview>("overview"), adminFetch<{ events: AdminEvent[] }>("events?limit=500")]);
      const prev = dataRef.current;
      if (prev) {
        setPrevIds(new Set(prev.users.map((u) => u.id)));
        setLastLook(prev.now);
      } else {
        // Первый заход: точки — у тех, кто был после прошлого открытия админки.
        setLastLook(readLastLook());
      }
      writeLastLook(ov.now);
      dataRef.current = ov;
      setLoadedAt(ov.now);
      setData(ov);
      setEvents(ev.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map((data?.users ?? []).map((u) => [u.id, u])), [data]);
  const open = openId ? byId.get(openId) ?? null : null;

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h1" sx={{ flex: 1 }}>
          {t("Админка", "Admin")}
        </Typography>
        <IconButton
          onClick={() => void load()}
          disabled={loading}
          aria-label={t("Обновить", "Refresh")}
          sx={{ width: 40, height: 40, bgcolor: "action.hover" }}
        >
          {loading ? <CircularProgress size={18} /> : <RefreshRoundedIcon />}
        </IconButton>
      </Stack>

      <Box sx={{ mb: 2 }}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "people", label: t("Люди", "People") },
            { value: "visits", label: t("Посещения", "Visits") },
            { value: "log", label: t("Журнал", "Log") },
          ]}
        />
      </Box>

      {error && (
        <Card sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: RED }}>
            {error === "forbidden" ? t("Нет доступа к админке", "No admin access") : t("Не удалось загрузить данные", "Couldn’t load data")}
          </Typography>
        </Card>
      )}
      {!data && !error && (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {data && view === "people" && (
        <People data={data} onOpen={setOpenId} onRefresh={load} prevIds={prevIds} lastLook={lastLook} loadedAt={loadedAt} />
      )}
      {data && view === "visits" && <Visits data={data} events={events} byId={byId} />}
      {data && view === "log" && <Log events={events} byId={byId} onOpen={setOpenId} />}

      {open && data && <UserDialog user={open} now={data.now} events={events} onClose={() => setOpenId(null)} onChanged={load} />}
    </Box>
  );
}

// ───────────── Люди ─────────────

function People({
  data,
  onOpen,
  onRefresh,
  prevIds,
  lastLook,
  loadedAt,
}: {
  data: Overview;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  /** id с прошлой загрузки: новые строки въезжают сверху. null — первая загрузка. */
  prevIds: Set<string> | null;
  /** Когда ты в прошлый раз смотрел список: точка у тех, кто заходил позже. */
  lastLook: number | null;
  loadedAt: number;
}) {
  const t = useT();
  const day = 86400;
  const active7 = data.users.filter((u) => u.seen && data.now - u.seen < 7 * day).length;
  const new30 = data.users.filter((u) => u.first && data.now - u.first < 30 * day).length;
  const workouts = data.users.reduce((s, u) => s + u.workouts, 0);

  return (
    <>
      <Card sx={{ mb: 1.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
          <Tile label={t("Всего людей", "People")} value={data.users.length} />
          <Tile label={t("Активны 7 дн.", "Active 7d")} value={active7} />
          <Tile label={t("Новые 30 дн.", "New 30d")} value={new30} />
          <Tile label={t("Тренировок", "Workouts")} value={workouts} />
        </Box>
        <BotLine bot={data.bot} />
      </Card>

      <PullToRefresh
        onRefresh={onRefresh}
        header={(st) => (
          <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", px: 0.5, mb: 1 }}>
            <Typography sx={{ ...text.title, fontSize: 16 }}>{t("Пользователи", "Users")}</Typography>
            <Typography sx={{ ...text.caption, transition: "opacity .2s" }}>
              {st === "pull"
                ? t("Потяни, чтобы обновить", "Pull to refresh")
                : st === "release"
                  ? t("Отпусти, чтобы обновить", "Release to refresh")
                  : st === "loading"
                    ? t("Обновляем…", "Updating…")
                    : updatedLabel(loadedAt, data.now, t)}
            </Typography>
          </Stack>
        )}
      >
        {data.users.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1.25 }}>
            {t("Пока никого", "Nobody yet")}
          </Typography>
        )}
        {data.users.map((u) => {
          const fresh = prevIds != null && !prevIds.has(u.id);
          const active = lastLook != null && (u.seen ?? 0) > lastLook;
          return (
            <Stack
              key={u.id}
              direction="row"
              spacing={1.5}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(u.id)}
              sx={{
                alignItems: "center",
                py: 1.25,
                px: 0.5,
                borderRadius: radius.control,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                ...(fresh && { animation: "rowIn .7s cubic-bezier(.16,1,.3,1) both" }),
                "@keyframes rowIn": {
                  from: { opacity: 0, transform: "translateY(-16px) scale(.96)", filter: "blur(4px)", maxHeight: 0, paddingTop: 0, paddingBottom: 0 },
                  to: { opacity: 1, transform: "none", filter: "none", maxHeight: 80 },
                },
              }}
            >
              <Avatar user={u} inverse={fresh} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                    {displayName(u)}
                  </Typography>
                  {u.admin && <Dot color={GREEN} label={t("вы", "you")} />}
                  {u.blocked && <Dot color={RED} label={t("блок", "blocked")} />}
                </Stack>
                <Typography noWrap sx={{ ...text.caption, display: "block" }}>
                  {[u.username && u.name ? `@${u.username}` : null, platformLabel(u.plat, t), `${u.workouts} ${t("трен.", "wkts")}`]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: "text.secondary", flex: "none", fontVariantNumeric: "tabular-nums" }}>
                {shortAgo(u.seen, data.now, t)}
              </Typography>
              <Box
                aria-label={active ? t("заходил после твоего прошлого просмотра", "active since your last look") : undefined}
                sx={{ width: 7, height: 7, borderRadius: "50%", flex: "none", bgcolor: active ? GREEN : "transparent" }}
              />
            </Stack>
          );
        })}
      </PullToRefresh>
    </>
  );
}

function BotLine({ bot }: { bot: Overview["bot"] }) {
  const t = useT();
  const ok = bot.polling === "on" && bot.username;
  return (
    <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: ok ? "text.secondary" : AMBER }}>
      {ok
        ? t(`Вход в браузере через @${bot.username} работает`, `Browser sign-in via @${bot.username} is on`)
        : bot.polling === "conflict"
          ? t("У бота стоит вебхук — вход в браузере выключен", "The bot has a webhook — browser sign-in is off")
          : t("Бот не отвечает — вход в браузере недоступен", "Bot unreachable — browser sign-in unavailable")}
    </Typography>
  );
}

// ───────────── Посещения ─────────────

function Visits({ data, events, byId }: { data: Overview; events: AdminEvent[]; byId: Map<string, AdminUser> }) {
  const t = useT();
  const lang = useLang();
  const theme = useTheme();
  const [sel, setSel] = useState(data.daily.length - 1);
  const max = Math.max(1, ...data.daily.map((d) => d.visits));
  const last7 = data.daily.slice(-7);
  const today = data.daily[data.daily.length - 1];
  const picked = data.daily[sel] ?? today;
  const visitsOfDay = events.filter((e) => e.e === "visit" && localDay(e.t) === picked.d);
  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });

  return (
    <>
      <Card sx={{ mb: 1.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1, mb: 2 }}>
          <Tile label={t("Сегодня", "Today")} value={today.users} aside={<Typography sx={text.caption}>{t("чел.", "ppl")}</Typography>} />
          <Tile label={t("За 7 дн.", "7 days")} value={last7.reduce((s, d) => s + d.visits, 0)} aside={<Typography sx={text.caption}>{t("визитов", "visits")}</Typography>} />
          <Tile label={t("За 30 дн.", "30 days")} value={data.daily.reduce((s, d) => s + d.visits, 0)} />
        </Box>
        <Typography sx={{ ...text.label, mb: 1 }}>{t("Посещения по дням", "Visits per day")}</Typography>
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: "3px", height: 96 }}>
          {data.daily.map((d, i) => (
            <Box
              key={d.d}
              role="button"
              aria-label={`${fmtDay(d.d)}: ${d.visits}`}
              onClick={() => setSel(i)}
              sx={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "pointer" }}
            >
              <Box
                sx={{
                  width: "100%",
                  height: `${Math.max(d.visits ? 6 : 2, (d.visits / max) * 100)}%`,
                  borderRadius: "3px 3px 1px 1px",
                  bgcolor: i === sel ? GREEN : alpha(theme.palette.text.primary, d.visits ? 0.22 : 0.08),
                }}
              />
            </Box>
          ))}
        </Box>
        <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.75 }}>
          <Typography sx={text.caption}>{fmtDay(data.daily[0].d)}</Typography>
          <Typography sx={text.caption}>{t("сегодня", "today")}</Typography>
        </Stack>
      </Card>

      <Card>
        <Typography sx={{ ...text.title, fontSize: 16, mb: 1 }}>
          {fmtDay(picked.d)} · {picked.visits} {t("визитов", "visits")}, {picked.users} {t("чел.", "ppl")}
        </Typography>
        {visitsOfDay.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t("Никто не заходил", "No visits")}
          </Typography>
        )}
        <Stack spacing={0.75}>
          {visitsOfDay.map((e, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
              <Typography sx={{ ...text.caption, width: 40, flex: "none", fontVariantNumeric: "tabular-nums" }}>{clock(e.t)}</Typography>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {e.uid && byId.get(e.uid) ? displayName(byId.get(e.uid)!) : `id ${e.uid ?? "—"}`}
              </Typography>
              <Typography sx={text.caption}>{platformLabel(e.p ?? "", t)}</Typography>
            </Stack>
          ))}
        </Stack>
      </Card>
    </>
  );
}

// ───────────── Журнал ─────────────

function Log({ events, byId, onOpen }: { events: AdminEvent[]; byId: Map<string, AdminUser>; onOpen: (id: string) => void }) {
  const t = useT();
  const [filter, setFilter] = useState<LogFilter>("all");
  const shown = events.filter(FILTERS[filter]);
  const labels: Record<LogFilter, string> = {
    all: t("Все", "All"),
    visit: t("Визиты", "Visits"),
    auth: t("Входы", "Sign-ins"),
    admin: t("Админ", "Admin"),
    problems: t("Проблемы", "Problems"),
  };

  return (
    <>
      <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5 }}>
        {(Object.keys(labels) as LogFilter[]).map((f) => (
          <Chip key={f} label={labels[f]} onClick={() => setFilter(f)} variant={filter === f ? "filled" : "outlined"} color={filter === f ? "primary" : "default"} />
        ))}
      </Stack>
      <Card sx={{ p: 0.75 }}>
        {shown.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1.25 }}>
            {t("Событий нет", "No events")}
          </Typography>
        )}
        {shown.slice(0, 300).map((e, i) => {
          const u = e.uid ? byId.get(e.uid) : undefined;
          const meta = eventMeta(e, t);
          return (
            <Stack
              key={i}
              direction="row"
              spacing={1.25}
              onClick={u ? () => onOpen(u.id) : undefined}
              sx={{ alignItems: "center", p: 1, borderRadius: radius.tile, cursor: u ? "pointer" : "default", "&:hover": u ? { bgcolor: "action.hover" } : undefined }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: meta.color, flex: "none" }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {meta.label}
                  {u ? ` · ${displayName(u)}` : e.uid ? ` · id ${e.uid}` : ""}
                </Typography>
                {(e.d || e.p) && (
                  <Typography sx={{ ...text.caption, display: "block" }} noWrap>
                    {[e.p ? platformLabel(e.p, t) : null, e.d].filter(Boolean).join(" · ")}
                  </Typography>
                )}
              </Box>
              <Typography sx={{ ...text.caption, flex: "none", fontVariantNumeric: "tabular-nums" }}>{stamp(e.t)}</Typography>
            </Stack>
          );
        })}
      </Card>
    </>
  );
}

function eventMeta(e: AdminEvent, t: (ru: string, en: string) => string): { label: string; color: string } {
  switch (e.e) {
    case "visit":
      return { label: t("Открыл приложение", "Opened the app"), color: "text.disabled" };
    case "new_user":
      return { label: t("Новый пользователь", "New user"), color: GREEN };
    case "login_web":
      return { label: t("Вход в браузере", "Browser sign-in"), color: GREEN };
    case "logout":
      return { label: t("Выход в браузере", "Browser sign-out"), color: "text.disabled" };
    case "login_blocked":
      return { label: t("Заблокированный пытался войти", "Blocked user tried to sign in"), color: RED };
    case "account_deleted":
      return { label: t("Кто-то удалил аккаунт", "Someone deleted their account"), color: AMBER };
    case "quota":
      return { label: t("Упёрся в лимит 10 МБ", "Hit the 10 MB limit"), color: AMBER };
    case "bot_conflict":
      return { label: t("Конфликт бота (вебхук)", "Bot conflict (webhook)"), color: RED };
    case "admin":
      return { label: t("Действие админа", "Admin action"), color: AMBER };
    case "admin_pinned":
      return { label: t("Админка закреплена за аккаунтом", "Admin pinned to account"), color: GREEN };
    default:
      return { label: e.e, color: "text.disabled" };
  }
}

// ───────────── Карточка человека ─────────────

function UserDialog({
  user,
  now,
  events,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  now: number;
  events: AdminEvent[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState(false);
  const recent = events.filter((e) => e.uid === user.id).slice(0, 8);

  async function act(action: "block" | "unblock" | "logout" | "delete") {
    setBusy(action);
    setErr(false);
    try {
      await adminFetch("user", { uid: user.id, action });
      await onChanged();
      if (action === "delete") onClose();
    } catch {
      setErr(true);
    } finally {
      setBusy(null);
    }
  }

  const tgLink = user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.id}`;
  const rows: [string, string][] = [
    [t("Telegram id", "Telegram id"), user.id],
    [t("Впервые", "First seen"), user.first ? stamp(user.first) : "—"],
    [t("Последний раз", "Last seen"), ago(user.seen, now, t)],
    [t("Визитов", "Visits"), `${user.visits} · ${user.visits7} ${t("за 7 дн.", "in 7d")}`],
    [t("Откуда", "Platform"), platformLabel(user.plat, t) || "—"],
    [t("Пришёл через", "Joined via"), user.via === "web" ? t("браузер", "browser") : "Telegram"],
    [t("Тренировок / записей", "Workouts / records"), `${user.workouts} / ${user.records}`],
    [t("Данные на сервере", "Data on server"), formatSize(user.size)],
    [t("Веб-сессий", "Browser sessions"), String(user.webSessions)],
  ];

  return (
    <Dialog open onClose={onClose} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Avatar user={user} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ ...text.title }} noWrap>
              {displayName(user)}
            </Typography>
            {user.username && (
              <Typography sx={text.caption} noWrap>
                @{user.username}
              </Typography>
            )}
          </Box>
        </Stack>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label={t("Закрыть", "Close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ bgcolor: "action.hover", borderRadius: radius.tile, p: 1.5, mb: 2 }}>
          {rows.map(([k, v]) => (
            <Stack key={k} direction="row" spacing={1} sx={{ justifyContent: "space-between", py: 0.4 }}>
              <Typography sx={text.caption}>{k}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {v}
              </Typography>
            </Stack>
          ))}
        </Box>

        {recent.length > 0 && (
          <>
            <Typography sx={{ ...text.label, mb: 0.75 }}>{t("Последние события", "Recent events")}</Typography>
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              {recent.map((e, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
                  <Typography variant="body2" noWrap>
                    {eventMeta(e, t).label}
                  </Typography>
                  <Typography sx={{ ...text.caption, flex: "none" }}>{stamp(e.t)}</Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        <Stack spacing={1}>
          <Button fullWidth variant="outlined" href={tgLink} target="_blank" rel="noopener">
            {t("Написать в Telegram", "Message in Telegram")}
          </Button>
          {user.webSessions > 0 && (
            <Button fullWidth variant="outlined" disabled={busy != null} onClick={() => void act("logout")}>
              {busy === "logout" ? <CircularProgress size={18} /> : t("Завершить веб-сессии", "End browser sessions")}
            </Button>
          )}
          {!user.admin && (
            <Button fullWidth variant="outlined" color={user.blocked ? "primary" : "warning"} disabled={busy != null} onClick={() => void act(user.blocked ? "unblock" : "block")}>
              {busy === "block" || busy === "unblock" ? <CircularProgress size={18} /> : user.blocked ? t("Разблокировать", "Unblock") : t("Заблокировать", "Block")}
            </Button>
          )}
          {!user.admin &&
            (confirmDelete ? (
              <Stack direction="row" spacing={1}>
                <Button fullWidth onClick={() => setConfirmDelete(false)}>
                  {t("Отмена", "Cancel")}
                </Button>
                <Button fullWidth variant="contained" color="error" disabled={busy != null} onClick={() => void act("delete")}>
                  {busy === "delete" ? <CircularProgress size={18} color="inherit" /> : t("Да, удалить всё", "Yes, delete all")}
                </Button>
              </Stack>
            ) : (
              <Button fullWidth color="error" onClick={() => setConfirmDelete(true)}>
                {t("Удалить данные с сервера", "Delete server data")}
              </Button>
            ))}
          {confirmDelete && (
            <Typography sx={text.caption}>
              {t(
                "Сотрутся данные, копии и запись о человеке. Его устройства очистятся при следующем открытии. Отменить нельзя.",
                "Data, backups and the user record are erased. Their devices wipe on next open. Can’t be undone.",
              )}
            </Typography>
          )}
          {err && (
            <Typography variant="caption" sx={{ color: RED }}>
              {t("Не получилось — попробуй ещё раз", "Didn’t work — try again")}
            </Typography>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Мелочи ─────────────

function Avatar({ user, inverse }: { user: AdminUser; inverse?: boolean }) {
  const letter = (user.name || user.username || "?").trim().charAt(0).toUpperCase();
  return (
    <Box
      sx={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        flex: "none",
        display: "grid",
        placeItems: "center",
        bgcolor: inverse ? "text.primary" : "action.selected",
        color: inverse ? "background.default" : "text.primary",
        transition: "background-color .6s ease, color .6s ease",
        fontWeight: 700,
        fontSize: 14,
        opacity: user.blocked ? 0.5 : 1,
      }}
    >
      {letter}
    </Box>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <Box component="span" sx={{ px: 0.75, py: 0.1, borderRadius: radius.pill, fontSize: 11, fontWeight: 700, color, bgcolor: alpha(color, 0.14), flex: "none" }}>
      {label}
    </Box>
  );
}

function displayName(u: AdminUser): string {
  return u.name || (u.username ? `@${u.username}` : `id ${u.id}`);
}

function platformLabel(p: string, t: (ru: string, en: string) => string): string {
  if (!p) return "";
  const [ch, os] = p.split(":");
  const where = ch === "web" ? t("браузер", "browser") : ch === "tg" ? "Telegram" : ch;
  const osName: Record<string, string> = { ios: "iOS", android: "Android", mac: "Mac", macos: "Mac", windows: "Windows", tdesktop: "Desktop", weba: "Web", webk: "Web", other: "" };
  const o = os ? osName[os] ?? os : "";
  return o ? `${where} ${o}` : where;
}

function ago(ts: number | null, now: number, t: (ru: string, en: string) => string): string {
  if (!ts) return "—";
  const s = Math.max(0, now - ts);
  if (s < 120) return t("только что", "just now");
  if (s < 3600) return t(`${Math.floor(s / 60)} мин назад`, `${Math.floor(s / 60)} min ago`);
  if (s < 86400) return t(`${Math.floor(s / 3600)} ч назад`, `${Math.floor(s / 3600)} h ago`);
  const d = Math.floor(s / 86400);
  return d === 1 ? t("вчера", "yesterday") : t(`${d} дн. назад`, `${d} d ago`);
}

/** Коротко для правого края строки: «2м», «1ч», «3д». */
function shortAgo(ts: number | null, now: number, t: (ru: string, en: string) => string): string {
  if (!ts) return "—";
  const s = Math.max(0, now - ts);
  if (s < 60) return t("сейчас", "now");
  if (s < 3600) return t(`${Math.floor(s / 60)}м`, `${Math.floor(s / 60)}m`);
  if (s < 86400) return t(`${Math.floor(s / 3600)}ч`, `${Math.floor(s / 3600)}h`);
  return t(`${Math.floor(s / 86400)}д`, `${Math.floor(s / 86400)}d`);
}

function updatedLabel(at: number, now: number, t: (ru: string, en: string) => string): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - (at || now));
  return s < 60 ? t("Обновлено только что", "Updated just now") : t(`Обновлено ${Math.floor(s / 60)} мин назад`, `Updated ${Math.floor(s / 60)} min ago`);
}

const LOOK_KEY = "repeat_admin_last_look";
function readLastLook(): number | null {
  try {
    const v = Number(localStorage.getItem(LOOK_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeLastLook(ts: number): void {
  try {
    localStorage.setItem(LOOK_KEY, String(ts));
  } catch {
    /* приватный режим — без точек */
  }
}

function clock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stamp(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })} ${clock(ts)}`;
}

function localDay(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
