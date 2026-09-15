"use client";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AccountDeletedNotice() {
  const notice = useRef<HTMLDivElement>(null);
  // The redirect loads a new document. Focus its result so assistive technology
  // announces it even when initial live-region content would be skipped.
  useEffect(() => {
    notice.current?.focus();
  }, []);
  return (
    <Alert role="status" tabIndex={-1} ref={notice}>
      <AlertDescription>Your account was deleted.</AlertDescription>
    </Alert>
  );
}
