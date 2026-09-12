import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// Both signed-in pages fail the same way when the workspace cannot be opened.
export function WorkspaceUnavailable() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <Alert>
        <AlertTitle>Workspace temporarily unavailable</AlertTitle>
        <AlertDescription>
          We could not open your workspace. Please try again shortly.
        </AlertDescription>
      </Alert>
    </main>
  );
}
