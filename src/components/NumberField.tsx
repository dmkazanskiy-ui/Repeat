import { useEffect, useRef, useState } from "react";
import TextField from "@mui/material/TextField";
import type { TextFieldProps } from "@mui/material/TextField";

type Props = Omit<TextFieldProps, "value" | "onChange" | "type"> & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Целые числа (повторы, пульс) — запятую и точку не пропускаем. */
  integer?: boolean;
};

function toText(value: number | null): string {
  if (value == null) return "";
  return String(value).replace(".", ",");
}

function parse(text: string): number | null {
  const normalized = text.replace(",", ".");
  if (normalized === "" || normalized === "." || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Числовое поле, которое не мешает набирать дробные значения.
 *
 * Наивный вариант «значение из числа в пропсе» ломается на первом же
 * разделителе: пользователь печатает «12,», это парсится в 12, число
 * возвращается в поле — и запятая исчезает, дробь набрать невозможно.
 * Поэтому пока поле в фокусе, источник правды — введённый текст,
 * а наружу отдаётся его разобранное значение.
 */
export default function NumberField({
  value,
  onChange,
  integer = false,
  ...rest
}: Props) {
  const [text, setText] = useState(() => toText(value));
  const focused = useRef(false);

  // Пока поле не в фокусе, оно следует за внешним значением
  // (например, после копирования тренировки на другую дату).
  useEffect(() => {
    if (!focused.current) setText(toText(value));
  }, [value]);

  return (
    <TextField
      {...rest}
      value={text}
      slotProps={{
        ...rest.slotProps,
        htmlInput: {
          inputMode: integer ? "numeric" : "decimal",
          ...(typeof rest.slotProps?.htmlInput === "object"
            ? rest.slotProps.htmlInput
            : {}),
        },
      }}
      onFocus={(event) => {
        focused.current = true;
        rest.onFocus?.(event);
      }}
      onBlur={(event) => {
        focused.current = false;
        // На выходе приводим текст к каноничному виду: «6,80» → «6,8».
        setText(toText(parse(text)));
        rest.onBlur?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        // Пропускаем только цифры и один разделитель — иначе в поле
        // окажется «6,,8» или буквы, и значение молча станет пустым.
        // В целых полях разделитель просто игнорируется: обрезать ввод
        // на запятой смысла нет — пользователь всё равно допечатает цифру.
        const cleaned = integer
          ? raw.replace(/\D/g, "")
          : raw.replace(/[^\d.,]/g, "").replace(/([.,])(?=.*[.,])/g, "");
        setText(cleaned);
        onChange(parse(cleaned));
      }}
    />
  );
}
