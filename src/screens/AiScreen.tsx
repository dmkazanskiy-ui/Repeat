// ИИ-помощник: три способа дать Claude/ChatGPT работать с Repeat.
//  1. Вставить от ИИ — ответ с JSON вставляется вручную (работает у всех).
//  2. Промпт для ИИ — формат и мои данные одним текстом, чтобы ИИ ответил верно.
//  3. Подключить напрямую — MCP-коннектор (вход через Telegram) или ключ API.
import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { Card, Section } from "../ui";
import Segmented from "../ui/Segmented";
import { ArrowBack, ContentCopy } from "../ui/icons";
import { buildAiPrompt, createKey, listGrants, mcpUrl, revokeGrant, type AgentGrant, type AgentScope } from "../lib/agent";
import { haptic } from "../lib/telegram";
import { useT } from "../lib/i18n";
import type { BodyEntry, Exercise, Plan, PlannedSession, Session, TrainingProgram } from "../lib/types";
import type { ImportRecord } from "../lib/aiFormat";

interface Props {
  authed: boolean;
  sessions: Session[];
  exercises: Exercise[];
  programs: TrainingProgram[];
  plans: Plan[];
  plannedSessions: PlannedSession[];
  bodyEntries: BodyEntry[];
  onBack: () => void;
  onImport: () => void;
  imports?: ImportRecord[];
  onUndoImport?: (rec: ImportRecord) => void;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    haptic("success");
    return true;
  } catch {
    return false;
  }
}

export default function AiScreen({ authed, sessions, exercises, programs, plans, plannedSessions, bodyEntries, onBack, onImport, imports = [], onUndoImport }: Props) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const flash = async (key: string, text: string) => {
    if (await copy(text)) {
      setCopied(key);
      setManual(null);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } else setManual(text);
  };
  const url = mcpUrl();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h1" sx={{ flex: 1 }} noWrap>
          {t("ИИ-помощник", "AI assistant")}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t(
          "Claude, ChatGPT или другой ИИ может составить план и записать тренировки за тебя. Всё, что он присылает, сначала показывается тебе — и записывается только после подтверждения.",
          "Claude, ChatGPT or another AI can build a plan and log workouts for you. Everything it sends is shown to you first and saved only after you confirm.",
        )}
      </Typography>

      <Section title={t("Вставить ответ ИИ", "Paste an AI answer")}>
        <Card sx={{ display: "grid", gap: 1.5 }}>
          <Typography variant="body2">
            {t(
              "Скопируй промпт, отправь его ИИ вместе с просьбой («составь план на месяц», «запиши вчерашнюю пробежку 5 км за 30 минут») и вставь ответ сюда.",
              "Copy the prompt, send it to the AI with your request (\"plan my month\", \"log yesterday's 5 km run in 30 min\") and paste the answer here.",
            )}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<ContentCopy />}
            onClick={() => void flash("prompt", buildAiPrompt({ sessions, exercises, programs, plans, plannedSessions, bodyEntries }))}
          >
            {copied === "prompt" ? t("Скопировано", "Copied") : t("Скопировать промпт для ИИ", "Copy prompt for AI")}
          </Button>
          <Button variant="contained" onClick={onImport}>
            {t("Вставить от ИИ", "Paste from AI")}
          </Button>
        </Card>
      </Section>

      {imports.length > 0 && (
        <Section title={t("Последние импорты", "Recent imports")}>
          <Card sx={{ display: "grid", gap: 1.25 }}>
            {imports.slice(0, 5).map((r) => (
              <Box key={r.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                    {r.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.at).toLocaleString(t("ru-RU", "en-US"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {r.kind === "plan" ? t(`карточек ${r.plannedIds.length}`, `${r.plannedIds.length} cards`) : t(`тренировок ${r.sessionIds.length}`, `${r.sessionIds.length} workouts`)}
                  </Typography>
                </Box>
                <Button size="small" color="inherit" sx={{ color: "text.secondary" }} onClick={() => onUndoImport?.(r)}>
                  {t("Отменить", "Undo")}
                </Button>
              </Box>
            ))}
          </Card>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {t("Отмена убирает ровно то, что добавил импорт. Тренировки, начатые по плану, остаются.", "Undo removes exactly what the import added. Workouts you started from the plan stay.")}
          </Typography>
        </Section>
      )}

      <Section title={t("Подключить напрямую", "Connect directly")}>
        <Card sx={{ display: "grid", gap: 1.5 }}>
          <Typography variant="body2">
            {t(
              "Через MCP ИИ сам читает твои тренировки и план и присылает новое во «входящие» Repeat.",
              "With MCP the AI reads your workouts and plan itself and sends new ones to your Repeat inbox.",
            )}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.25, borderRadius: "12px", bgcolor: "action.hover" }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontFamily: "ui-monospace, monospace", fontSize: 13, overflowWrap: "anywhere" }}>
              {url}
            </Typography>
            <IconButton size="small" aria-label={t("Скопировать адрес", "Copy URL")} onClick={() => void flash("url", url)}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Box>
          {copied === "url" && <Typography variant="caption" color="primary">{t("Адрес скопирован", "URL copied")}</Typography>}
          <Step n={1} title="Claude (claude.ai, Desktop, телефон)">
            {t(
              "Настройки → Коннекторы → «Добавить свой коннектор» → вставь адрес → «Подключить» → войди через Telegram и разреши доступ.",
              "Settings → Connectors → \"Add custom connector\" → paste the URL → Connect → sign in with Telegram and allow access.",
            )}
          </Step>
          <Step n={2} title="ChatGPT">
            {t(
              "Настройки → Приложения и коннекторы → «Создать» (нужен режим разработчика) → вставь адрес, авторизация OAuth → войди через Telegram.",
              "Settings → Apps & Connectors → Create (developer mode) → paste the URL, OAuth auth → sign in with Telegram.",
            )}
          </Step>
          <Step n={3} title="Claude Code, Cursor и др.">
            {t("Создай ключ ниже и подключи по адресу с заголовком Authorization.", "Create a key below and connect to the URL with an Authorization header.")}
          </Step>
        </Card>
      </Section>

      <Section title={t("Ключи и доступы", "Keys & access")}>
        {authed ? (
          <Grants url={url} onCopy={flash} copied={copied} />
        ) : (
          <Alert severity="info">{t("Войди через Telegram в профиле — ключи привязываются к аккаунту.", "Sign in with Telegram in Profile — keys belong to your account.")}</Alert>
        )}
      </Section>

      {manual && (
        <TextField multiline fullWidth minRows={4} value={manual} sx={{ mt: 2 }} label={t("Скопируй вручную", "Copy manually")} slotProps={{ htmlInput: { readOnly: true } }} />
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>
        {t(
          "Данные о тренировках уходят выбранному ИИ-сервису только когда ты сам подключаешь его или копируешь промпт. Заметки и самочувствие в промпт не попадают. Доступ отзывается здесь в любой момент.",
          "Workout data goes to the AI service you choose only when you connect it or copy the prompt. Notes and mood are not included. Revoke access here any time.",
        )}
      </Typography>
    </Box>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1.25 }}>
      <Box sx={{ width: 24, height: 24, flex: "none", borderRadius: "50%", bgcolor: "action.selected", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>
        {n}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {children}
        </Typography>
      </Box>
    </Box>
  );
}

function Grants({ url, onCopy, copied }: { url: string; onCopy: (key: string, text: string) => void; copied: string | null }) {
  const t = useT();
  const [grants, setGrants] = useState<AgentGrant[] | null>(null);
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<AgentScope>("write");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listGrants()
      .then((g) => {
        setGrants(g);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(reload, [reload]);

  async function create() {
    setBusy(true);
    try {
      const res = await createKey(name.trim() || "Claude Code", scope);
      setFresh(res.token);
      setName("");
      reload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const fmt = (ts: number | null) => (ts ? new Date(ts * 1000).toLocaleDateString() : t("ещё нет", "never"));
  const command = fresh ? `claude mcp add --transport http repeat ${url} --header "Authorization: Bearer ${fresh}"` : "";

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      {error && <Alert severity="warning">{t("Сервер недоступен — попробуй позже.", "Server unavailable — try later.")}</Alert>}
      {grants && grants.length > 0 && (
        <Card sx={{ display: "grid", gap: 1.25 }}>
          {grants.map((g) => (
            <Box key={g.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                  {g.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {g.kind === "oauth" ? t("коннектор", "connector") : t("ключ", "key")} · {g.scope === "write" ? t("чтение и запись", "read & write") : t("только чтение", "read only")} · {t("был", "used")} {fmt(g.used)}
                </Typography>
              </Box>
              <Button
                size="small"
                color="inherit"
                sx={{ color: "text.secondary" }}
                onClick={() => {
                  void revokeGrant(g.id).then(reload);
                }}
              >
                {t("Отозвать", "Revoke")}
              </Button>
            </Box>
          ))}
        </Card>
      )}

      <Card sx={{ display: "grid", gap: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("Новый ключ API", "New API key")}
        </Typography>
        <TextField label={t("Для чего", "Name")} placeholder="Claude Code" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />
        <Segmented
          size="small"
          value={scope}
          onChange={setScope}
          options={[
            { value: "write", label: t("Чтение и запись", "Read & write") },
            { value: "read", label: t("Только чтение", "Read only") },
          ]}
        />
        <Button variant="contained" onClick={() => void create()} disabled={busy}>
          {t("Создать ключ", "Create key")}
        </Button>
        {fresh && (
          <Alert severity="success" sx={{ "& .MuiAlert-message": { minWidth: 0, width: "100%" } }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t("Ключ показывается один раз — сохрани его. Команда для Claude Code:", "The key is shown once — save it. Command for Claude Code:")}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace", fontSize: 12, overflowWrap: "anywhere", mb: 1 }}>
              {command}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={() => onCopy("cmd", command)}>
                {copied === "cmd" ? t("Скопировано", "Copied") : t("Копировать команду", "Copy command")}
              </Button>
              <Button size="small" variant="outlined" onClick={() => onCopy("key", fresh)}>
                {copied === "key" ? t("Скопировано", "Copied") : t("Только ключ", "Key only")}
              </Button>
            </Box>
          </Alert>
        )}
      </Card>
    </Box>
  );
}
