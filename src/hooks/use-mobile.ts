import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(listener: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", listener);
  return () => list.removeEventListener("change", listener);
}

// Whether the viewport is phone-sized. The server cannot know, so it renders
// the desktop layout and the browser corrects it on hydration.
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
