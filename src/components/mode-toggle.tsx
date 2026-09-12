"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Monitor, Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const themeModes = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

// A quick switch between light, dark and the device's own setting. Signed-in
// pages also link to the full appearance settings from here. The menu only
// renders once opened in the browser, where the stored mode is already known.
export function ModeToggle({ withSettings = false }: { withSettings?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" aria-label="Theme">
          <Sun
            aria-hidden="true"
            className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
          />
          <Moon
            aria-hidden="true"
            className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themeModes.map((mode) => (
            <DropdownMenuRadioItem key={mode.id} value={mode.id}>
              <mode.icon aria-hidden="true" />
              {mode.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {withSettings && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings aria-hidden="true" />
                Appearance settings
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
