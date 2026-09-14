import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// Both signed-in pages fail the same way when the workspace cannot be opened.
export function WorkspaceUnavailable() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <Alert>
        <AlertTitle>Your journal isn&apos;t available right now</AlertTitle>
        <AlertDescription>
          We couldn&apos;t open it this time. Give it another try in a moment.
        </AlertDescription>
      </Alert>
    </main>
  );
}
