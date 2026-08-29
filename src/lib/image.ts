/**
 * Ужимаем фото прогресса перед сохранением: телефонный снимок на 4–8 МБ
 * в IndexedDB как dataURL — это расточительно и тормозит загрузку. Приводим
 * к максимум 1080 px по длинной стороне и JPEG 0.8 — для «как я выгляжу»
 * этого с запасом, а вес падает в десятки раз.
 */
/** Загрузить картинку из dataURL (нужно и при импорте, и при миграции). */
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    image.src = dataUrl;
  });
}

function scaleToDataUrl(
  img: HTMLImageElement,
  maxSide: number,
  quality: number,
  fallback: string,
): string {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback; // без canvas сохраняем как есть
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Превью для сетки: ~320 px и качество пониже. Сетка перестаёт грузить и
 * декодировать полноразмерные кадры — именно это тормозило галерею.
 */
export async function dataUrlToThumb(dataUrl: string, maxSide = 320, quality = 0.6): Promise<string> {
  const img = await loadImage(dataUrl);
  return scaleToDataUrl(img, maxSide, quality, dataUrl);
}

/** Импорт снимка: полный кадр для просмотра и превью для сетки. */
export async function fileToPhoto(file: File): Promise<{ full: string; thumb: string }> {
  const full = await fileToScaledDataUrl(file);
  const thumb = await dataUrlToThumb(full);
  return { full, thumb };
}

export async function fileToScaledDataUrl(
  file: File,
  maxSide = 1080,
  quality = 0.8,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);
  return scaleToDataUrl(img, maxSide, quality, dataUrl);
}
