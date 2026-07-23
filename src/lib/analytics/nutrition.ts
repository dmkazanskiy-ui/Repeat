// Абстракция над данными питания/веса из приложения Forma. Прямой интеграции
// пока нет — локальная реализация возвращает null, и UI НЕ показывает
// несуществующие данные. Когда появится API Forma, сюда встанет реальный провайдер.

export interface NutritionSummary {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface NutritionDataProvider {
  nutritionSummary(start: string, end: string): Promise<NutritionSummary | null>;
  weightSeries(start: string, end: string): Promise<WeightPoint[] | null>;
  macros(start: string, end: string): Promise<NutritionSummary | null>;
}

/** Заглушка: данных Forma нет, отдаём null, чтобы UI их не выдумывал. */
export const nullNutritionProvider: NutritionDataProvider = {
  async nutritionSummary() {
    return null;
  },
  async weightSeries() {
    return null;
  },
  async macros() {
    return null;
  },
};
