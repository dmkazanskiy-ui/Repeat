/**
 * Ужимаем фото прогресса перед сохранением: телефонный снимок на 4–8 МБ
 * в IndexedDB как dataURL — это расточительно и тормозит загрузку. Приводим
 * к максимум 1080 px по длинной стороне и JPEG 0.8 — для «как я выгляжу»
 * этого с запасом, а вес падает в десятки раз.
 */
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

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl; // без canvas сохраняем как есть
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}
