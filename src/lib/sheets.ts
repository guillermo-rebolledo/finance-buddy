import "server-only";
import { database } from "./database";
import { summarize } from "./journal";
import {
  entryKindDetail,
  periodLabel,
  signedAmount,
  type Period,
  type PeriodKind,
  type Summary,
  type SummaryRequest,
} from "./financial";

// A snapshot is written as typed cells, never as a formula: a category name or
// note that begins with "=" stays the text the owner typed, and every amount
// stays a number the spreadsheet can add up.
function text(value: string) {
  return { userEnteredValue: { stringValue: value } };
}
function heading(value: string) {
  return {
    ...text(value),
    userEnteredFormat: { textFormat: { bold: true } },
  };
}
function amount(value: string) {
  return {
    userEnteredValue: { numberValue: Number(value) },
    userEnteredFormat: {
      numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
    },
  };
}
function sheet(title: string, rows: { values: unknown[] }[]) {
  return {
    properties: { title },
    data: [{ startRow: 0, startColumn: 0, rowData: rows }],
  };
}
// The spreadsheet carries the same figures as the summary on screen: the same
// totals, the same category groups and the same rows, in MXN, with the period
// it covers and the Mexico City date it was generated stated separately.
// The title names the period covered and, separately, the date the snapshot was
// generated. A finished spreadsheet keeps the date it was created with, so the
// title is always built from that export's own date and never from today's.
export function snapshotTitle(
  kind: PeriodKind,
  period: Period,
  exportDate: string,
) {
  return `Finance Buddy: ${periodLabel(kind, period)} (exported ${exportDate})`;
}
function snapshot(summary: Summary) {
  return {
    properties: { title: snapshotTitle(summary.kind, summary, summary.today) },
    sheets: [
      sheet("Summary", [
        { values: [heading("Finance Buddy snapshot")] },
        { values: [text("Period"), text(periodLabel(summary.kind, summary))] },
        { values: [text("Covered from"), text(summary.start)] },
        { values: [text("Covered to"), text(summary.end)] },
        { values: [text("Generated (Mexico City)"), text(summary.today)] },
        { values: [text("Currency"), text(summary.currency)] },
        { values: [heading("Total income"), amount(summary.income)] },
        { values: [heading("Total expenses"), amount(summary.expenses)] },
        { values: [heading("Net change"), amount(summary.netChange)] },
        {
          values: [
            text("Entries"),
            { userEnteredValue: { numberValue: summary.entries.length } },
          ],
        },
      ]),
      sheet("Categories", [
        { values: [heading("Category"), heading("Total expenses (MXN)")] },
        ...summary.breakdown.map((group) => ({
          values: [text(group.category), amount(group.amount)],
        })),
        ...(summary.breakdown.length
          ? []
          : [{ values: [text("No expenses or refunds in this period.")] }]),
      ]),
      sheet("Entries", [
        {
          values: [
            heading("Movement date"),
            heading("Type"),
            heading("Category"),
            heading("Amount (MXN)"),
            heading("Note"),
          ],
        },
        // A refund reads as the reduction it is, exactly as the entry rows on
        // screen do, so the column adds up to the totals above.
        ...summary.entries.map((entry) => ({
          values: [
            text(entry.date),
            text(entryKindDetail(entry.kind)?.label ?? entry.kind),
            text(entry.category),
            amount(signedAmount(entry)),
            text(entry.note),
          ],
        })),
        ...(summary.entries.length
          ? []
          : [{ values: [text("No entries in this period.")] }]),
      ]),
    ],
  };
}

export type ExportRefusal = {
  status: number;
  message: string;
  reconnect?: true;
};
export const reconnectRefusal: ExportRefusal = {
  status: 403,
  reconnect: true,
  message:
    "Google Sheets export is not connected, or the permission expired or was revoked. Connect Google Sheets export and try again. Your journal is unaffected.",
};
const unconfirmedRefusal: ExportRefusal = {
  status: 409,
  message:
    "An earlier attempt with this export was not confirmed, so nothing was created again. Check your Google Drive, then export again to create a new spreadsheet.",
};
const retryRefusal: ExportRefusal = {
  status: 503,
  message:
    "Google could not complete the export. Nothing was created and your journal is unchanged. Retry this same export.",
};

// An export whose outcome the app cannot prove: the row keeps saying so, and
// the owner is sent to look in Google Drive rather than exporting again blindly.
async function unconfirmed(owner: string, id: string) {
  await database()
    .query(
      "UPDATE spreadsheet_export SET status='unconfirmed' WHERE owner_id=$1 AND id=$2",
      [owner, id],
    )
    .catch(() => {});
  return { refused: unconfirmedRefusal };
}
// One explicit export creates one spreadsheet. The identifier the owner's
// request carries claims a row first, so a repeated submission returns the
// spreadsheet already finished rather than creating another, and an attempt
// whose outcome never arrived refuses to create a second one blindly.
export async function exportSnapshot(
  owner: string,
  id: string,
  request: SummaryRequest,
  accessToken: string,
): Promise<{ url: string; title: string } | { refused: ExportRefusal }> {
  const summary = await summarize(owner, request);
  const claimed = await database().query(
    `INSERT INTO spreadsheet_export(id, owner_id, period_kind, period_start, period_end, export_date, status)
    VALUES ($1,$2,$3,$4::date,$5::date,$6::date,'pending') ON CONFLICT DO NOTHING RETURNING id`,
    [id, owner, request.kind, summary.start, summary.end, summary.today],
  );
  if (!claimed.rowCount) {
    const {
      rows: [existing],
    } = await database().query(
      `SELECT status, spreadsheet_url AS url, period_kind AS kind,
        to_char(period_start,'YYYY-MM-DD') AS start, to_char(period_end,'YYYY-MM-DD') AS "end",
        to_char(export_date,'YYYY-MM-DD') AS "exportDate"
      FROM spreadsheet_export WHERE owner_id=$1 AND id=$2`,
      [owner, id],
    );
    // The row can only have gone if a concurrent attempt of the same export
    // failed outright, which leaves this one safe to make again.
    if (!existing) return { refused: retryRefusal };
    if (
      existing.kind !== request.kind ||
      existing.start !== summary.start ||
      existing.end !== summary.end
    )
      return {
        refused: {
          status: 409,
          message:
            "This export already covers a different period. Reload and export the period you are viewing.",
        },
      };
    // The same export, already finished: its own spreadsheet, not a new one.
    if (existing.status === "complete")
      return {
        url: existing.url,
        title: snapshotTitle(existing.kind, existing, existing.exportDate),
      };
    return { refused: unconfirmedRefusal };
  }
  let created;
  try {
    // The whole snapshot is written by the request that creates the
    // spreadsheet, so a spreadsheet exists only once all of it is in it.
    created = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot(summary)),
    });
  } catch {
    // No reply at all: a spreadsheet may or may not exist.
    return unconfirmed(owner, id);
  }
  if (!created.ok) {
    // A provider failure may have created a spreadsheet the app never heard
    // about, so that export is never retried into a second one. Every other
    // refusal came before anything was created, and can be retried as itself.
    if (created.status >= 500) return unconfirmed(owner, id);
    await database().query(
      "DELETE FROM spreadsheet_export WHERE owner_id=$1 AND id=$2",
      [owner, id],
    );
    return {
      refused:
        created.status === 401 || created.status === 403
          ? reconnectRefusal
          : retryRefusal,
    };
  }
  try {
    const result = (await created.json()) as {
      spreadsheetId?: string;
      spreadsheetUrl?: string;
    };
    if (!result.spreadsheetUrl) throw new Error("No spreadsheet was named");
    await database().query(
      "UPDATE spreadsheet_export SET status='complete', spreadsheet_url=$3 WHERE owner_id=$1 AND id=$2",
      [owner, id, result.spreadsheetUrl],
    );
    return {
      url: result.spreadsheetUrl,
      title: snapshotTitle(summary.kind, summary, summary.today),
    };
  } catch {
    // A spreadsheet exists but the app cannot prove which, so it says so
    // instead of exporting again on its own.
    return unconfirmed(owner, id);
  }
}
