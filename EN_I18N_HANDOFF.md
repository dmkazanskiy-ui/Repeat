# EN localization — handoff (finish me)

Full-app EN i18n is ~85% done. **Builds green (`npx tsc -b`, EXIT 0), 80 tests pass, NOT deployed.**
Continue from here after context reset.

## How it works (reuse, don't reinvent)
- **Components:** `const t = useT(); t("ru","en")` — from `src/lib/i18n.ts`.
- **Pure lib code / constants:** `import { L } from "../i18n"` → `L("ru","en")`; module-level `getLang()`.
- **Label maps** (`Record<K,string>`) are **getters**: `{ get chest(){ return L("Грудь","Chest") } }` — keeps `X[key]` working and language-dynamic without touching call sites. Arrays of `{value,label}` → getter on `label`.
- **Exercise names:** `Exercise.nameEn` field + `exerciseName(ex)` helper (in `types.ts`, reads `getLang()`). `.name` stays Russian (muscle classifier `muscles.ts` and `base:` ids match on it). RU→EN map `NAME_EN` (216 entries) lives in `catalog.ts`, seeded in `store.ts`.
- **App:** `LangContext.Provider`, `changeLang` calls `setCurrentLang` + `saveLang`. Keep module lang in sync.

## Gotchas (learned the hard way)
- **Check builds ONLY with `npx tsc -b`** — `tsc --noEmit` masks errors via the project-references cache.
- In `perl s///`, **never put `${...}` in the replacement** (perl interpolates it → "Undefined subroutine &main::t"). Do template-literal strings via Python (put pairs in a JSON file in scratchpad to dodge apostrophe/quote hell) or the Edit tool.
- `grep -q 'useT'` false-matches `useTheme` — add the i18n import explicitly (verify `from "../lib/i18n"` is present).
- Live RU→EN toggle for baked strings inside analytics `useMemo`: add `lang` (from `useLang()`) to that memo's deps so it recomputes on toggle. AnalyticsScreen already has `const t`/`lang`.

## Remaining UI strings (TODO)
1. **AnalyticsScreen** (last un-applied edit that got rejected):
   - `src/lib/analytics/program.ts` `nameOf` → `exerciseName(exercises.find(...))` (+ import exerciseName).
   - gainers header "Лидеры роста e1RM".
   - `DeltaRow` (module-level fn): add `const t = useT()`, translate "новое упражнение", "разгрузка", "было".
2. **Analytics components:**
   - `StrengthProgress.tsx`: `RANGES` (Месяц/3 мес/6 мес/Год/Всё), `TREND_LABEL` (растёт/стабилен/снижается/мало данных), "плато N нед", `Metric` labels (Лучший вес/Лучшие повторы/Лучший объём/Тренировок/Последний рекорд/Плато сейчас/Самое долгое плато + кг/нед).
   - `SummaryHero.tsx`: InsightCard labels (Кардио/Мобилити/Восстановление/Лучший результат/Рекорды/Прогресс) + "Показатели за период".
   - `CapacitiesCard.tsx`, `RestBalanceCard.tsx` (title/message come from rest.ts already-EN; check its own strings), `RadarChart.tsx`, `Meters.tsx`, `MetricChart.tsx`, `GoalLensCard.tsx` (verify).
3. **ExercisePickerDialog.tsx:** "Своё упражнение"/"Упражнение", "Закрыть", "Название", "Группа мышц", placeholder "Поиск по 200+ упражнениям", "Все". Also make the search filter match `nameEn` too.
4. **programLibrary.ts:** preset names + descriptions → L getters. Preset exercise names are RU keys (resolve to catalog); for the preview in `ProgramsScreen.tsx` line ~94 (`e.name`) add a `catalogNameEn(ruName)` lookup from catalog.
5. **store.ts:** `WORKOUT_LETTERS` ("День A"→"Day A") and default program name "Моя программа" via L.
6. **types.ts:** `moodReading` fallback "нейтрально" → "neutral". (Legacy PERCEIVED_EFFECTS/AFTER_STATES/RECOVERY_METRICS labels are mostly unused now — low priority.)
7. **SwipeToDelete.tsx** (aria "Удалить"), **ProfileScreen.tsx** (3 minor — re-check).

## Do NOT translate (data / internal)
- `catalog.ts` RAW list and `NAME_EN` keys (Russian is the source of truth).
- Exercise pools in `workoutBuilder.ts` (RU names are lookup keys → resolve to catalog).
- `muscles.ts` `test` patterns (`n.includes("жим")` etc.) — internal classifier logic, must stay RU.
- `summary.ts` `periodSummary` — NOT rendered anywhere (only `summarize`/facts are used).

## Finish steps
1. `npx tsc -b` (0) and `npx vitest run` (80 pass).
2. `npm run dev` + Chrome: Profile → toggle **EN**, walk every screen (Calendar/Today, new-workout wizard, editors strength+cardio, session view, recovery, history, **Analytics all 4 tabs**, Onboarding [clear IndexedDB to trigger], Programs). Confirm exercise names are English and toggling back to **RU** reverts everything live.
3. Grep sweep: `grep -rnE '[А-Яа-яЁё]' src --include='*.tsx' --include='*.ts'` → only comments + translation tables (`NAME_EN`, `TR`, RAW, classifier patterns) should remain.
4. `npm run deploy`; note completion in `SPEC.md` + memory `repeat-app.md`.
