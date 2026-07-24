// Помощники для SVG-графиков: плавная кривая (Catmull-Rom → кубический Безье)
// и столбец со скруглённой верхушкой. Держим геометрию в одном месте, чтобы
// все графики выглядели одинаково современно.

export type Pt = [number, number];

/** Гладкий путь через точки (кривая Катмулла-Рома, переведённая в Безье). */
export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** Замкнуть линию в область до базовой линии (для градиентной заливки). */
export function areaPath(pts: Pt[], baseline: number, left: number, right: number): string {
  if (pts.length === 0) return "";
  return `${smoothPath(pts)} L ${right} ${baseline} L ${left} ${baseline} Z`;
}

/** Прямоугольник со скруглённой только верхней кромкой (data-end у столбца). */
export function roundedTopRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return (
    `M ${x} ${y + h}` +
    ` L ${x} ${y + radius}` +
    ` Q ${x} ${y} ${x + radius} ${y}` +
    ` L ${x + w - radius} ${y}` +
    ` Q ${x + w} ${y} ${x + w} ${y + radius}` +
    ` L ${x + w} ${y + h}` +
    ` Z`
  );
}
