import "server-only";
import { renderSerializedDoc } from "@formepdf/core";
import { serialize } from "@formepdf/react";
import { FinancialReport } from "@/components/pdf/financial-report";
import type { Summary } from "./financial";

// The export date distinguishes snapshots of the same period.
export function reportFileName(summary: Summary) {
  return `finance-buddy-${summary.kind}-${summary.start}-to-${summary.end}-exported-${summary.today}.pdf`;
}

export async function reportDocument(summary: Summary) {
  return renderSerializedDoc({ ...serialize(<FinancialReport summary={summary} />) });
}
