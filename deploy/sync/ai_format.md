# Repeat: формат для ИИ (repeat-plan / repeat-workout, версия 1)

Repeat — трекер тренировок. Ты (ИИ-ассистент) можешь прислать в него план на
несколько недель или отдельные тренировки. Пользователь вставляет твой ответ
в приложение («Профиль → ИИ-помощник → Вставить от ИИ») или ты отправляешь
его инструментами MCP `submit_plan` / `submit_workouts`. Перед записью
пользователь видит предпросмотр и подтверждает. Ничего не удаляется: история,
программы и вес остаются, повторная отправка того же не создаёт дублей.

Отвечай одним JSON-объектом (можно в блоке ```json). Даты — `YYYY-MM-DD`,
время — `HH:mm` (местное время пользователя), вес — кг, длительность — минуты.
Диапазон можно писать числом или парой `[от, до]`.

## Виды активностей

`kind`: `strength` (силовая), `cardio`, `mobility`, `recovery` (восстановление).

- `cardioKind`: `run` бег, `bike` велосипед, `swim` плавание, `treadmill`
  ходьба на дорожке, `treadmill_run` бег на дорожке, `elliptical` эллипс,
  `stairs` степпер.
- `recoveryType`: `sauna` сауна, `banya` баня, `steam` хаммам, `hot_bath`,
  `cold_plunge` холодная купель, `ice_bath`, `cold_shower`, `contrast`,
  `massage`, `sports_massage`, `full_rest` день отдыха.
- `mobilityKind`: `stretching` растяжка/мобилити, `yoga`, `lfk`, `breathing`,
  `meditation`, `foam_rolling`.

Русские названия тоже понимаются («Бег», «Баня», «Холодная купель»).
Упражнения называй по-русски, как в каталоге: «Жим штанги лёжа», «Приседания
со штангой на спине», «Тяга верхнего блока к груди». Совпадение ищется по
названию; незнакомое упражнение создаётся своим — тогда укажи `muscleGroup`:
`chest`, `back`, `shoulders`, `legs`, `glutes`, `arms`, `core`, `other`.

## План: `repeat-plan`

```json
{
  "format": "repeat-plan",
  "version": 1,
  "name": "Гибрид: декабрь 2026",
  "timezone": "Asia/Makassar",
  "start": "2026-11-30",
  "end": "2026-12-27",
  "goal": "Скинуть вес, сохранить силу",
  "program": {
    "name": "Гибрид А/Б (дек 2026)",
    "progression": { "type": "double", "stepKg": 2.5, "dumbbellStepKg": 2 },
    "wave": null,
    "deloadEveryWeeks": 6,
    "workouts": {
      "A": {
        "name": "День А: грудь / спина",
        "exercises": [
          { "exercise": "Жим штанги лёжа", "sets": 3, "repMin": 6, "repMax": 10, "startWeightKg": 95 },
          { "exercise": "Скручивания на блоке", "sets": 3, "repMin": 12, "repMax": 15, "muscleGroup": "core", "note": "вес подобрать" }
        ]
      }
    }
  },
  "days": [
    {
      "date": "2026-11-30",
      "sessions": [
        { "slot": "morning", "time": "05:45", "kind": "strength", "title": "Зал А", "programWorkout": "A" },
        { "slot": "day", "time": "11:00", "kind": "cardio", "title": "Дорожка в наклон",
          "cardioKind": "treadmill", "durationMin": 50, "hrMin": 110, "hrMax": 130, "inclineDeg": [5, 8] },
        { "slot": "day", "time": "17:00", "kind": "recovery", "title": "Бассейн + баня",
          "items": [
            { "kind": "Плавание", "durationMin": [20, 30] },
            { "kind": "Баня", "durationMin": 20, "note": "2 захода" },
            { "kind": "Холодная купель", "durationMin": [2, 3], "optional": true }
          ] }
      ]
    }
  ],
  "rules": { "running": "пульс 135–145, бег прибавлять не больше 10% в неделю" }
}
```

- `program` необязателен: план может быть только из кардио и восстановления.
  Если есть — создаётся новая программа; старые программы не меняются.
- `slot`: `morning`, `day` или `evening`. В одном слоте может быть несколько
  карточек.
- Цели карточки (все необязательны): `durationMin`, `distanceKm`, `hrMin`,
  `hrMax`, `hrZone` (1–5), `cadenceMin`, `cadenceMax`, `inclineDeg`, `note`.
- `items` — несколько активностей подряд («бассейн + баня + купель»). Каждая
  станет отдельной карточкой в приложении; `optional: true` — по желанию.
- `programWorkout` — ключ тренировки из `program.workouts`.
- `progression.type: "double"` — двойная прогрессия: когда во всех рабочих
  подходах набран `repMax`, в следующий раз вес растёт на `stepKg`
  (гантели и изоляция — на `dumbbellStepKg`).

## Тренировки: `repeat-workout`

Сделанные (записать в историю) или будущие (запланировать) тренировки.

```json
{
  "format": "repeat-workout",
  "version": 1,
  "workouts": [
    {
      "date": "2026-12-01", "time": "07:00", "kind": "strength", "title": "Ноги", "done": true,
      "durationMin": 65,
      "exercises": [
        { "exercise": "Приседания со штангой на спине",
          "sets": [ { "weightKg": 60, "reps": 8, "warmup": true }, { "weightKg": 95, "reps": 8 }, { "weightKg": 95, "reps": 7 } ] }
      ]
    },
    { "date": "2026-12-02", "time": "06:00", "kind": "cardio", "cardioKind": "run", "done": true,
      "durationMin": 32, "distanceKm": 5.1, "avgHr": 141, "calories": 380 },
    { "date": "2026-12-03", "kind": "recovery", "recoveryType": "banya", "durationMin": 25, "done": true },
    { "date": "2026-12-05", "time": "11:00", "kind": "strength", "title": "Верх", "done": false,
      "exercises": [ { "exercise": "Жим штанги лёжа", "sets": 3, "repMin": 6, "repMax": 10, "weightKg": 95 } ] }
  ]
}
```

- `done: true` — тренировка завершена и попадает в историю и аналитику.
  `done: false` — запланирована на дату, пользователь начнёт её сам.
- Подходы: массив `{ weightKg, reps, warmup? }` или число `sets` вместе с
  `repMin`/`repMax`/`weightKg`. Разминочные подходы помечай `warmup: true` —
  они не идут в тоннаж и прогрессию. Упражнение без веса — `weightKg` не пиши.
- Кардио: `durationMin`, `distanceKm`, `avgHr`, `inclineDeg`, `calories`.
  Восстановление и мобилити: `durationMin`, `note`.
- Если в этот день есть такая же карточка плана, сделанная тренировка закроет её.
