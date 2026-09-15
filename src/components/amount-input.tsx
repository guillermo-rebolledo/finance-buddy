"use client";
import * as React from "react";
import { formatAmountInput, pastedAmountInput } from "@/lib/financial";
import { Input } from "@/components/ui/input";

// New digits push the ones before them left, so the caret is tracked by how
// many digits follow it, which typing elsewhere never changes.
function digitsAfter(text: string, position: number) {
  return text.slice(position).replace(/\D/g, "").length;
}
function positionBefore(text: string, count: number) {
  let position = text.length;
  for (let seen = 0; position > 0 && seen < count; position--)
    if (/\d/.test(text[position - 1])) seen++;
  return position;
}

type AmountInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  // Receives the amount as displayed, with grouping commas; plainAmount strips
  // them before validating or saving.
  onValueChange?: (value: string) => void;
};

// A money field filled cents first, as on a card terminal, with thousands
// grouped by commas. It works both controlled (value) and uncontrolled
// (defaultValue, FormData).
function AmountInput({
  value,
  defaultValue,
  onValueChange,
  onKeyDown,
  onPaste,
  ...props
}: AmountInputProps) {
  function show(input: HTMLInputElement, next: string, caret: number) {
    input.value = next;
    input.setSelectionRange(caret, caret);
    onValueChange?.(next);
  }
  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      value={value === undefined ? undefined : formatAmountInput(value)}
      defaultValue={
        defaultValue === undefined ? undefined : formatAmountInput(defaultValue)
      }
      onKeyDown={(event) => {
        onKeyDown?.(event);
        const input = event.currentTarget;
        const { selectionStart: start, selectionEnd: end } = input;
        if (start === null || start !== end) return;
        // Deleting beside a comma or the decimal point removes the digit past
        // it; removing only the separator would be undone by the mask.
        if (event.key === "Backspace" && /[,.]/.test(input.value[start - 1]))
          input.setSelectionRange(start - 1, start - 1);
        if (event.key === "Delete" && /[,.]/.test(input.value[start] ?? ""))
          input.setSelectionRange(start + 1, start + 1);
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        const typed = input.value;
        const formatted = formatAmountInput(typed);
        // Deleting down to zero empties the field; only a typed 0 reads 0.00.
        const deleting = (
          event.nativeEvent as InputEvent
        ).inputType?.startsWith("delete");
        const next = deleting && /^[0.]*$/.test(formatted) ? "" : formatted;
        show(
          input,
          next,
          positionBefore(
            next,
            digitsAfter(typed, input.selectionStart ?? typed.length),
          ),
        );
      }}
      onPaste={(event) => {
        onPaste?.(event);
        event.preventDefault();
        const next = pastedAmountInput(event.clipboardData.getData("text"));
        if (next) show(event.currentTarget, next, next.length);
      }}
    />
  );
}

export { AmountInput };
