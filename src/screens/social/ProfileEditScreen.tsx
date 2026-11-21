// Мой публичный профиль: фото, имя, о себе, чем занимаюсь, и открыт ли он.
import { useRef, useState } from "react";
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, Stack, Switch, TextField, Typography } from "@mui/material";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import { Card, Section, radius } from "../../ui";
import { ArrowBack as ArrowBackIcon } from "../../ui/icons";
import Avatar from "../../components/social/Avatar";
import DocLink from "../../components/DocLink";
import GhostField from "../../components/GhostField";
import { bioSuggestions } from "../../lib/suggestions";
import AvatarCropDialog from "../../components/social/AvatarCropDialog";
import { ACTIVITIES, saveProfile, uploadAvatar, useMyProfile } from "../../lib/social";
import type { ActivityId, MyProfile } from "../../lib/social";
import { fileToScaledDataUrl } from "../../lib/image";
import { useLang, useT } from "../../lib/i18n";

export const SHARE_CONSENT_URL = "share-consent.html";

type Props = { onBack: () => void; onPreview: (pid: string) => void };

export default function ProfileEditScreen(props: Props) {
  const me = useMyProfile();
  // Поля формы берут начальные значения из профиля — рисуем форму, когда он загружен.
  if (!me) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  return <Editor key={me.pid} {...props} me={me} />;
}

function Editor({ onBack, onPreview, me }: Props & { me: MyProfile }) {
  const t = useT();
  const lang = useLang();
  const [name, setName] = useState(me?.name ?? "");
  const [bio, setBio] = useState(me?.bio ?? "");
  const [acts, setActs] = useState<ActivityId[]>(me?.acts ?? []);
  const [isPublic, setPublic] = useState(me?.public ?? false);
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const turningOn = isPublic && !me.public;
  const dirty = name !== me.name || bio !== me.bio || acts.join() !== me.acts.join() || isPublic !== me.public;

  // Выбрал фото → сначала обрезка в круг, потом загрузка.
  async function pickPhoto(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError(null);
    try {
      setCropSrc(await fileToScaledDataUrl(file, 1600, 0.9));
    } catch {
      setError(t("Не получилось открыть фото — попробуй другое.", "Couldn’t open the photo — try another one."));
    }
  }

  async function uploadCropped(data: string) {
    setCropSrc(null);
    setPreview(data);
    try {
      await uploadAvatar(data);
    } catch {
      setPreview(null);
      setError(t("Не получилось загрузить фото — попробуй другое.", "Couldn’t upload the photo — try another one."));
    }
  }

  async function save() {
    if (turningOn && !consent) return;
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ name: name.trim(), bio: bio.trim(), acts, public: isPublic, ...(turningOn ? { consent: true } : {}) });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(e instanceof Error && e.message === "name" ? t("Нужно имя", "Name is required") : t("Не удалось сохранить", "Couldn’t save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h1" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {t("Мой профиль", "My profile")}
        </Typography>
        {me.public && (
          <Button size="small" onClick={() => onPreview(me.pid)}>
            {t("Как видят другие", "Preview")}
          </Button>
        )}
      </Stack>

      <Stack sx={{ alignItems: "center", mb: 2.5 }}>
        <Box sx={{ position: "relative" }}>
          <Avatar person={{ ...me, name: name || me.name }} size={104} src={preview} />
          <IconButton
            onClick={() => fileRef.current?.click()}
            aria-label={t("Загрузить фото", "Upload photo")}
            sx={{ position: "absolute", right: -4, bottom: -4, width: 36, height: 36, bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }}
          >
            <PhotoCameraRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          {cropSrc && <AvatarCropDialog src={cropSrc} onCancel={() => setCropSrc(null)} onDone={(d) => void uploadCropped(d)} />}
        </Box>
      </Stack>

      <Stack spacing={1.5}>
        <TextField label={t("Имя", "Name")} value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} fullWidth />
        <Box>
          <GhostField
            label={t("О себе", "About me")}
            minRows={2}
            maxLength={200}
            value={bio}
            onChange={(v) => setBio(v.replace(/\n/g, " "))}
            candidates={bioSuggestions()}
            placeholder={t("Например: тренируюсь 4 раза в неделю", "E.g. training 4×/week")}
          />
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5, ml: 1.5 }}>{bio.length}/200</Typography>
        </Box>
      </Stack>

      <Section title={t("Чем занимаюсь", "What I do")}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {ACTIVITIES.map((a) => {
            const on = acts.includes(a.id);
            return (
              <Box
                key={a.id}
                component="button"
                aria-pressed={on}
                onClick={() => setActs((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]))}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  border: "none",
                  borderRadius: radius.pill,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 600,
                  bgcolor: on ? "primary.main" : "action.hover",
                  color: on ? "primary.contrastText" : "text.primary",
                  transition: "background-color .2s ease",
                }}
              >
                {lang === "ru" ? a.ru : a.en}
              </Box>
            );
          })}
        </Box>
      </Section>

      <Section title={t("Видимость", "Visibility")}>
        <Card>
          <FormControlLabel
            sx={{ m: 0, width: "100%", justifyContent: "space-between" }}
            labelPlacement="start"
            control={<Switch checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />}
            label={<Typography sx={{ fontSize: 15, fontWeight: 600 }}>{t("Публичный профиль", "Public profile")}</Typography>}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {t(
              "Другие люди в Repeat увидят фото, имя, «о себе» и твои тренировки за 90 дней: упражнения, подходы, время, дистанцию. Заметки, пульс, калории, вес тела и самочувствие не показываются. Отдельную тренировку можно скрыть в её меню «⋯».",
              "Other Repeat users will see your photo, name, bio and workouts from the last 90 days: exercises, sets, time, distance. Notes, heart rate, calories, body weight and mood stay private. Hide any workout from its ⋯ menu.",
            )}
          </Typography>
          {turningOn && (
            <FormControlLabel
              sx={{ mt: 1, alignItems: "flex-start", mx: 0 }}
              control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} sx={{ mt: -0.75, ml: -1 }} />}
              label={
                <Typography variant="body2">
                  {t("Даю ", "I give ")}
                  <DocLink href={SHARE_CONSENT_URL}>{t("согласие на показ этих данных другим пользователям", "consent to show this data to other users")}</DocLink>
                </Typography>
              }
            />
          )}
          {!isPublic && me.public && (
            <Typography variant="body2" sx={{ mt: 1, color: "warning.main" }}>
              {t("После сохранения профиль закроется, а твои тренировки пропадут из ленты.", "After saving, your profile closes and your workouts leave the feed.")}
            </Typography>
          )}
        </Card>
      </Section>

      {error && (
        <Typography variant="body2" sx={{ mt: 2, color: "error.main" }}>
          {error}
        </Typography>
      )}
      <Button fullWidth variant="contained" disabled={busy || !dirty || (turningOn && !consent) || !name.trim()} onClick={() => void save()} sx={{ mt: 3, height: 48 }}>
        {busy ? <CircularProgress size={20} color="inherit" /> : saved ? t("Сохранено", "Saved") : t("Сохранить", "Save")}
      </Button>
    </Box>
  );
}
