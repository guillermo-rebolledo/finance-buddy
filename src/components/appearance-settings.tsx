"use client";
import { useTheme } from "next-themes";
import {
  colorSchemes,
  schemeModes,
  type ColorScheme,
  type SchemeMode,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { themeModes } from "@/components/mode-toggle";
import { useColorScheme, useHydrated } from "@/components/theme-provider";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// A miniature page drawn in the scheme's own variables, in the mode it belongs
// to, so a scheme can be judged before it is chosen.
function SchemePreview({
  mode,
  scheme,
}: {
  mode: SchemeMode;
  scheme: ColorScheme;
}) {
  return (
    <div
      aria-hidden="true"
      {...{ [schemeModes[mode].attribute]: scheme }}
      className={cn(
        mode === "dark" && "dark",
        "flex flex-col gap-1.5 rounded-md border bg-background p-2",
      )}
    >
      <div className="flex flex-col gap-1 rounded-sm border bg-card p-2">
        <span className="h-1.5 w-2/3 rounded-full bg-foreground" />
        <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground" />
      </div>
      <div className="flex gap-1">
        <span className="h-3 flex-1 rounded-sm bg-primary" />
        <span className="h-3 w-6 rounded-sm bg-secondary" />
      </div>
    </div>
  );
}

function SchemeChoice({ mode }: { mode: SchemeMode }) {
  const [scheme, setScheme] = useColorScheme(mode);
  const legend = `${schemeModes[mode].label} mode colors`;
  return (
    <FieldSet>
      <FieldLegend>{legend}</FieldLegend>
      <FieldDescription>
        Used whenever the app is in {mode} mode, including when System chooses
        it.
      </FieldDescription>
      <RadioGroup
        aria-label={legend}
        value={scheme}
        onValueChange={(next) => setScheme(next as ColorScheme)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {colorSchemes.map((option) => (
          <FieldLabel key={option.id} htmlFor={`${mode}-${option.id}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <SchemePreview mode={mode} scheme={option.id} />
                <FieldTitle>{option.label}</FieldTitle>
              </FieldContent>
              <RadioGroupItem value={option.id} id={`${mode}-${option.id}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

// Appearance belongs to this browser rather than to the journal, so it is saved
// on the device and applies at once, with nothing to submit.
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  return (
    <main className="flex flex-col gap-8 pb-16 pt-8 md:pt-14">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Preferences for this browser. They are saved on this device and never
          change your journal.
        </p>
      </div>
      <section aria-label="Appearance">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Appearance</h2>
            </CardTitle>
            <CardDescription>
              Choose light or dark mode, and the colors each mode uses.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-8">
            <FieldSet>
              <FieldLegend>Theme</FieldLegend>
              <FieldDescription>
                System follows your device&apos;s light or dark setting.
              </FieldDescription>
              <RadioGroup
                aria-label="Theme"
                value={hydrated ? (theme ?? "") : ""}
                onValueChange={setTheme}
                className="grid gap-3 sm:grid-cols-3"
              >
                {themeModes.map((mode) => (
                  <FieldLabel key={mode.id} htmlFor={`theme-${mode.id}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <mode.icon aria-hidden="true" className="size-4" />
                          {mode.label}
                        </FieldTitle>
                      </FieldContent>
                      <RadioGroupItem value={mode.id} id={`theme-${mode.id}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
            <FieldSeparator />
            <SchemeChoice mode="light" />
            <FieldSeparator />
            <SchemeChoice mode="dark" />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
