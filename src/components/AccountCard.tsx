// Карточка аккаунта в профиле: кто вошёл, вход через Telegram в браузере,
// выход и (для владельца) вход в админку.
import { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import TelegramIcon from "@mui/icons-material/Telegram";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import { Card, IconBadge, radius } from "../ui";
import { ChevronRightRounded as ChevronRightRoundedIcon, Close as CloseIcon } from "../ui/icons";
import { inTelegram, logout, pollWebLogin, startWebLogin, useAccount } from "../lib/auth";
import { useMyProfile } from "../lib/social";
import Avatar from "./social/Avatar";
import type { LoginStart } from "../lib/auth";
import { useT } from "../lib/i18n";
import { ink } from "../lib/themeMode";

const TG_BLUE = ink("#38bdf8");
const ADMIN_GREEN = ink("#4ade80");

export default function AccountCard({ onOpenAdmin, onOpenSocialProfile }: { onOpenAdmin: () => void; onOpenSocialProfile: () => void }) {
  const t = useT();
  const account = useAccount();
  const social = useMyProfile();
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const tg = inTelegram();
  const me = account.me;

  const title = me ? me.name || (me.username ? `@${me.username}` : t("Аккаунт Telegram", "Telegram account")) : account.authed ? t("Аккаунт Telegram", "Telegram account") : t("Войти через Telegram", "Sign in with Telegram");
  const sub = account.authed
    ? [me?.username && me.name ? `@${me.username}` : null, tg ? t("в Telegram", "in Telegram") : t("в браузере", "in the browser")].filter(Boolean).join(" · ")
    : t("История станет общей с Repeat в Telegram", "Your history will be shared with Repeat in Telegram");

  return (
    <Card sx={{ mb: 3, p: 0, overflow: "hidden" }}>
      <Stack
        direction="row"
        spacing={1.5}
        role={account.authed ? undefined : "button"}
        tabIndex={account.authed ? undefined : 0}
        onClick={account.authed ? undefined : () => setLoginOpen(true)}
        sx={{ alignItems: "center", p: 2, cursor: account.authed ? "default" : "pointer" }}
      >
        <IconBadge color={TG_BLUE}>
          <TelegramIcon fontSize="small" />
        </IconBadge>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
            {sub}
          </Typography>
        </Box>
        {account.authed && !tg && (
          <Button size="small" color="inherit" onClick={() => setConfirmOut(true)} sx={{ color: "text.secondary" }}>
            {t("Выйти", "Sign out")}
          </Button>
        )}
        {!account.authed && <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />}
      </Stack>

      {account.authed && social && (
        <Stack
          direction="row"
          spacing={1.5}
          role="button"
          tabIndex={0}
          onClick={onOpenSocialProfile}
          sx={{ alignItems: "center", px: 2, py: 1.5, cursor: "pointer", borderTop: 1, borderColor: "divider" }}
        >
          <Avatar person={social} size={32} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t("Публичный профиль", "Public profile")}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {social.public ? t("Открыт — тренировки в ленте", "Public — workouts in the feed") : t("Закрыт — добавь фото и пару слов о себе", "Private — add a photo and a few words")}
            </Typography>
          </Box>
          <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
        </Stack>
      )}

      {account.admin && (
        <Stack
          direction="row"
          spacing={1.5}
          role="button"
          tabIndex={0}
          onClick={onOpenAdmin}
          sx={{ alignItems: "center", px: 2, py: 1.5, cursor: "pointer", borderTop: 1, borderColor: "divider" }}
        >
          <IconBadge color={ADMIN_GREEN} size={32}>
            <AdminPanelSettingsRoundedIcon sx={{ fontSize: 18 }} />
          </IconBadge>
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
            {t("Админка", "Admin")}
          </Typography>
          <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
        </Stack>
      )}

      {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
      <Dialog open={confirmOut} onClose={() => setConfirmOut(false)} fullWidth>
        <DialogTitle>{t("Выйти в этом браузере?", "Sign out in this browser?")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t(
              "История останется в аккаунте и в Telegram, а с этого браузера будет стёрта.",
              "Your history stays in the account and in Telegram, but is erased from this browser.",
            )}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            <Button onClick={() => setConfirmOut(false)}>{t("Отмена", "Cancel")}</Button>
            <Button variant="contained" color="error" onClick={() => void logout()}>
              {t("Выйти", "Sign out")}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type Step = { kind: "starting" } | { kind: "waiting"; start: LoginStart } | { kind: "done" } | { kind: "error"; reason: "denied" | "expired" | "bot" | "net" };

/** Вход через бота: открыть Telegram → «Войти» в чате → сайт сам подхватит. */
function LoginDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    alive.current = true;
    let timer = 0;
    setStep({ kind: "starting" });
    startWebLogin()
      .then((start) => {
        if (!alive.current) return;
        setStep({ kind: "waiting", start });
        const until = Date.now() + start.ttl * 1000;
        const tick = async () => {
          if (!alive.current) return;
          if (Date.now() > until) return setStep({ kind: "error", reason: "expired" });
          try {
            const st = await pollWebLogin(start.code);
            if (!alive.current) return;
            if (st === "ok") {
              setStep({ kind: "done" });
              window.setTimeout(() => alive.current && closeRef.current(), 1200);
              return;
            }
            if (st === "denied" || st === "expired") return setStep({ kind: "error", reason: st });
          } catch {
            /* сеть моргнула — пробуем дальше */
          }
          timer = window.setTimeout(tick, 2000);
        };
        timer = window.setTimeout(tick, 1500);
      })
      .catch((e: unknown) => alive.current && setStep({ kind: "error", reason: e instanceof Error && e.message === "bot" ? "bot" : "net" }));
    return () => {
      alive.current = false;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  const errorText = {
    denied: t("Вход отменён в Telegram.", "Sign-in was cancelled in Telegram."),
    expired: t("Ссылка устарела — она живёт 10 минут.", "The link expired — it lives for 10 minutes."),
    bot: t("Вход через бота сейчас недоступен. Попробуй позже.", "Bot sign-in is unavailable right now. Try later."),
    net: t("Нет связи с сервером.", "Can’t reach the server."),
  };

  return (
    <Dialog open onClose={onClose} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {t("Вход через Telegram", "Sign in with Telegram")}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label={t("Закрыть", "Close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {step.kind === "starting" && (
          <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {step.kind === "waiting" && (
          <>
            <Stack spacing={1} sx={{ mb: 2 }}>
              {[
                t("Открой Telegram кнопкой ниже", "Open Telegram with the button below"),
                t("В чате с ботом Repeat нажми «Войти»", "In the Repeat bot chat, tap Sign in"),
                t("Вернись сюда — вход подхватится сам", "Come back here — you’ll be signed in automatically"),
              ].map((line, i) => (
                <Stack key={i} direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  <Box sx={{ width: 24, height: 24, borderRadius: radius.pill, bgcolor: "action.hover", display: "grid", placeItems: "center", flex: "none" }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{i + 1}</Typography>
                  </Box>
                  <Typography variant="body2">{line}</Typography>
                </Stack>
              ))}
            </Stack>
            <Button fullWidth variant="contained" startIcon={<TelegramIcon />} href={step.start.url} target="_blank" rel="noopener">
              {t("Открыть Telegram", "Open Telegram")}
            </Button>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center", mt: 2, color: "text.secondary" }}>
              <CircularProgress size={14} color="inherit" />
              <Typography variant="caption">{t("Ждём подтверждения…", "Waiting for confirmation…")}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
              {t("Telegram на телефоне? Открой эту страницу там же или перешли себе ссылку:", "Telegram on your phone? Open this page there or send yourself the link:")}{" "}
              <Box component="span" sx={{ wordBreak: "break-all", userSelect: "all" }}>
                {step.start.url}
              </Box>
            </Typography>
          </>
        )}
        {step.kind === "done" && (
          <Typography variant="body1" sx={{ py: 3, textAlign: "center", fontWeight: 600 }}>
            {t("Готово — история синхронизируется", "Done — your history is syncing")}
          </Typography>
        )}
        {step.kind === "error" && (
          <Box sx={{ py: 2, textAlign: "center" }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {errorText[step.reason]}
            </Typography>
            <Button variant="contained" onClick={() => setAttempt((a) => a + 1)}>
              {t("Попробовать снова", "Try again")}
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
