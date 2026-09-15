"use client";
import * as React from "react";
import { completeAmountInput, formatAmountInput } from "@/lib/financial";
import { Input } from "@/components/ui/input";

// The caret is tracked by the digits and decimal point before it, so it stays
// put while the mask adds or moves grouping commas around it.
function significantBefore(text: string, position: number) {
  return text.slice(0, position).replace(/[^\d.]/g, "").length;
}
function positionAfter(text: string, count: number) {
  let position = 0;
  for (let seen = 0; position < text.length && seen < count; position++)
    if (text[position] !== ",") seen++;
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

// A money field that groups thousands with commas as the owner types, keeps at
// most two decimal places, and completes the cents when it loses focus. It
// works both controlled (value) and uncontrolled (defaultValue, FormData).
function AmountInput({
  value,
  defaultValue,
  onValueChange,
  onBlur,
  onKeyDown,
  ...props
}: AmountInputProps) {
  return (
    <Input
      {...props}
      inputMode="decimal"
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
        // Deleting beside a comma removes the digit past it; removing only the
        // comma would be undone by the mask.
        if (event.key === "Backspace" && input.value[start - 1] === ",")
          input.setSelectionRange(start - 1, start - 1);
        if (event.key === "Delete" && input.value[start] === ",")
          input.setSelectionRange(start + 1, start + 1);
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        const typed = input.value;
        const next = formatAmountInput(typed);
        const caret = positionAfter(
          next,
          significantBefore(typed, input.selectionStart ?? typed.length),
        );
        input.value = next;
        input.setSelectionRange(caret, caret);
        onValueChange?.(next);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        const input = event.currentTarget;
        const next = completeAmountInput(input.value);
        if (next === input.value) return;
        input.value = next;
        onValueChange?.(next);
      }}
    />
  );
}

export { AmountInput };
