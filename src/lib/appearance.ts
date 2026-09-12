// Appearance is a preference of this browser, not of the journal: it is kept in
// local storage and applied before the first paint, so no page flashes colours
// the owner did not choose. Each scheme names a set of CSS variables in
// globals.css, with its own values for light and for dark mode.
export const colorSchemes = [
  { id: "sage", label: "Sage" },
  { id: "neutral", label: "Neutral" },
  { id: "ocean", label: "Ocean" },
  { id: "rose", label: "Rose" },
  { id: "amber", label: "Amber" },
] as const;
export type ColorScheme = (typeof colorSchemes)[number]["id"];
export const defaultColorScheme: ColorScheme = "sage";

// Light and dark mode each remember their own scheme, so switching mode never
// loses the other mode's choice.
export const schemeModes = {
  light: {
    label: "Light",
    storageKey: "finance-buddy-light-scheme",
    attribute: "data-light-scheme",
  },
  dark: {
    label: "Dark",
    storageKey: "finance-buddy-dark-scheme",
    attribute: "data-dark-scheme",
  },
} as const;
export type SchemeMode = keyof typeof schemeModes;

export function isColorScheme(value: unknown): value is ColorScheme {
  return colorSchemes.some((scheme) => scheme.id === value);
}

// The stored scheme for a mode, or the default when nothing valid is stored or
// storage is unavailable.
export function storedColorScheme(mode: SchemeMode): ColorScheme {
  try {
    const stored = localStorage.getItem(schemeModes[mode].storageKey);
    return isColorScheme(stored) ? stored : defaultColorScheme;
  } catch {
    return defaultColorScheme;
  }
}

// Runs inline in the document head, before anything is painted.
export const colorSchemeScript = `(function(){var ids=${JSON.stringify(
  colorSchemes.map((scheme) => scheme.id),
)},modes=${JSON.stringify(Object.values(schemeModes))},root=document.documentElement;modes.forEach(function(mode){var value=null;try{value=localStorage.getItem(mode.storageKey)}catch(e){}root.setAttribute(mode.attribute,ids.indexOf(value)<0?${JSON.stringify(
  defaultColorScheme,
)}:value)})})()`;
