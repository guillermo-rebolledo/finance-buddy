"use client";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-24">
      <Alert>
        <AlertTitle>We hit a snag</AlertTitle>
        <AlertDescription>
          We couldn&apos;t open your journal. Give it another try.
        </AlertDescription>
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
