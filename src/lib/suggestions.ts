// Фразы для подсказок-призраков (GhostField). Сначала — то, что человек уже
// писал сам (свежее выше), потом — частые формулировки.
import { L } from "./i18n";
import type { Session } from "./types";

const TODO_RU = [
  "Взять ремни", "Взять перчатки", "Взять полотенце и воду", "Разминка 10 минут", "Заминка 10 минут",
  "Растяжка после тренировки", "Снять технику на видео", "Записать рабочие веса", "Попробовать +2,5 кг",
  "Следить за техникой", "Отдых между подходами 2 минуты", "Выпить протеин после", "Не забыть креатин",
  "Проверить пульс на заминке", "Пресс в конце",
];
const TODO_EN = [
  "Bring straps", "Bring gloves", "Bring a towel and water", "Warm up 10 minutes", "Cool down 10 minutes",
  "Stretch after the workout", "Film my form", "Log working weights", "Try +2.5 kg", "Focus on form",
  "Rest 2 minutes between sets", "Protein after", "Don’t forget creatine", "Abs at the end",
];
const BIO_RU = [
  "Тренируюсь 3 раза в неделю", "Тренируюсь 4 раза в неделю", "Тренируюсь 5 раз в неделю",
  "Сплит A/B/C/D", "Силовые и бег", "Бегаю по утрам", "Готовлюсь к полумарафону", "Готовлюсь к марафону",
  "Готовлюсь к первому забегу", "Пауэрлифтинг, работаю над жимом", "Кроссфит и функционалка",
  "Вернулся в спорт после перерыва", "Худею и набираю силу", "Набираю массу", "Йога и мобилити для спины",
  "Тренируюсь дома", "Тренируюсь в зале после работы",
];
const BIO_EN = [
  "Training 3 times a week", "Training 4 times a week", "Strength and running", "Running in the mornings",
  "Getting ready for a half marathon", "Getting ready for a marathon", "Powerlifting, working on my bench",
  "Back to training after a break", "Losing fat and getting stronger", "Training at home",
];
const NOTE_RU = [
  "Самочувствие отличное", "Тяжело далось", "Легко, можно добавить вес", "Плохо спал, сил мало",
  "Болит плечо — снизить вес", "Новый рекорд", "Техника стала лучше", "Не хватило времени на заминку",
  "В следующий раз добавить подход",
];
const NOTE_EN = [
  "Felt great", "Tough one", "Easy, can add weight", "Slept badly, low energy", "Shoulder hurts — lower the weight",
  "New record", "Form is getting better", "Add a set next time",
];

const uniq = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter((s) => s.length >= 3))];

export function todoSuggestions(sessions: Session[] = []): string[] {
  const own = [...sessions]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .flatMap((s) => (s.todos ?? []).map((t) => t.text));
  return uniq([...own, ...(L("ru", "en") === "ru" ? TODO_RU : TODO_EN)]);
}

export function bioSuggestions(): string[] {
  return L("ru", "en") === "ru" ? BIO_RU : BIO_EN;
}

export function noteSuggestions(sessions: Session[] = []): string[] {
  const own = [...sessions]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .flatMap((s) => (s.notes ?? "").split(/[.\n]/).map((x) => x.trim()));
  return uniq([...own.slice(0, 200), ...(L("ru", "en") === "ru" ? NOTE_RU : NOTE_EN)]);
}
