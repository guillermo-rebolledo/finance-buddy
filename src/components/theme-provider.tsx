"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ThemeProvider as ModeProvider } from "next-themes";
import {
  defaultColorScheme,
  isColorScheme,
  schemeModes,
  storedColorScheme,
  type ColorScheme,
  type SchemeMode,
} from "@/lib/appearance";

const schemeChange = "finance-buddy-scheme-change";

// The root element is the one source of truth for the schemes on screen; this
// brings it back in line with storage, which another tab may have changed.
function applyStoredSchemes() {
  for (const mode of Object.keys(schemeModes) as SchemeMode[])
    document.documentElement.setAttribute(
      schemeModes[mode].attribute,
      storedColorScheme(mode),
    );
}

function subscribe(listener: () => void) {
  const sync = () => {
    applyStoredSchemes();
    listener();
  };
  window.addEventListener("storage", sync);
  window.addEventListener(schemeChange, listener);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener(schemeChange, listener);
  };
}

// Light, dark or system mode is handled by next-themes as a class on the root
// element; the colour scheme for each mode is an attribute beside it.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    window.addEventListener("storage", applyStoredSchemes);
    return () => window.removeEventListener("storage", applyStoredSchemes);
  }, []);
  return (
    <ModeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ModeProvider>
  );
}

export function useColorScheme(mode: SchemeMode) {
  const { attribute, storageKey } = schemeModes[mode];
  const scheme = useSyncExternalStore(
    subscribe,
    () => {
      const current = document.documentElement.getAttribute(attribute);
      return isColorScheme(current) ? current : defaultColorScheme;
    },
    () => defaultColorScheme,
  );
  const setScheme = useCallback(
    (next: ColorScheme) => {
      document.documentElement.setAttribute(attribute, next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Unavailable storage still changes this page, just not the next one.
      }
      window.dispatchEvent(new Event(schemeChange));
    },
    [attribute, storageKey],
  );
  return [scheme, setScheme] as const;
}

// Mode is only known in the browser, so controls showing it render unselected
// on the server rather than guessing and mismatching on hydration.
export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
