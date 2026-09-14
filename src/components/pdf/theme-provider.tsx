import type { Style } from "@formepdf/react";
import type { DependencyList } from "react";
import { reportTheme } from "@/lib/pdf-themes/report";

// Forme serializes components without React's hook dispatcher. This app uses
// one immutable theme, rather than pdfcn's module-global mutable provider, so
// concurrent exports cannot change each other's styling.
export const usePdfcnTheme = () => reportTheme;
export const useSafeMemo = <T,>(factory: () => T, deps: DependencyList): T => {
  void deps;
  return factory();
};

type PdfStyleInput = Style | PdfStyleInput[] | false | null | undefined;
export function mergePdfStyles(...inputs: PdfStyleInput[]): Style {
  const merged: Style = {};
  for (const input of inputs) {
    if (Array.isArray(input)) Object.assign(merged, mergePdfStyles(...input));
    else if (input) Object.assign(merged, input);
  }
  return merged;
}
