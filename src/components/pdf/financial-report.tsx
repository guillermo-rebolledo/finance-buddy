import { Document, Fixed, Page, View } from "@formepdf/react";
import { PdfCard } from "./card/card";
import { DataTable } from "./data-table/data-table";
import { Heading } from "./heading/heading";
import { Text } from "./text/text";
import { reportTheme as theme } from "@/lib/pdf-themes/report";
import {
  entryKindDetail,
  money,
  periodLabel,
  signedAmount,
  signedMoney,
  type Summary,
} from "@/lib/financial";

// Bound each continuation row so the table can use the space remaining on a
// page. Native tables otherwise move a page-tall row past its first header.
// Break long tokens as well: a pasted URL must not widen all the columns.
function noteRows(note: string) {
  const words = note.split(/\s+/).filter(Boolean).flatMap((word) => word.match(/.{1,20}/gu) ?? []);
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    if (row.length + word.length > 120) {
      rows.push(row);
      row = "";
    }
    row += (row ? " " : "") + word;
  }
  rows.push(row);
  return rows;
}

function Total({ label, value, emphasis = false }: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text noMargin weight={emphasis ? "bold" : "normal"}>{label}</Text>
      <Text noMargin weight="bold" color={emphasis ? "primary" : "foreground"}>{value}</Text>
    </View>
  );
}

export function FinancialReport({ summary }: { summary: Summary }) {
  const label = periodLabel(summary.kind, summary);
  return (
    <Document title={`Finance Buddy — ${label}`} author="Finance Buddy" lang="en" tagged
      style={{ ...theme.typography.body, color: theme.colors.foreground }}>
      <Page size="A4" margin={{
        top: theme.spacing.page.marginTop,
        right: theme.spacing.page.marginRight,
        bottom: theme.spacing.page.marginBottom,
        left: theme.spacing.page.marginLeft,
      }}>
        <Fixed position="footer">
          <View style={{ borderTopWidth: 0.5, borderColor: theme.colors.border, paddingTop: 8 }}>
            <Text variant="xs" color="mutedForeground" align="right" noMargin>
              {"Page {{pageNumber}} of {{totalPages}}"}
            </Text>
          </View>
        </Fixed>

        <View wrap={false} style={{ borderTopWidth: 3, borderColor: theme.colors.primary, paddingTop: 16 }}>
          <Text variant="xs" weight="bold" color="primary" transform="uppercase">Finance Buddy</Text>
          <Heading>Financial report</Heading>
          <Text noMargin>{`Period covered: ${label} (${summary.start} to ${summary.end})`}</Text>
          <Text variant="xs" color="mutedForeground" noMargin>{`Exported on ${summary.today} (Mexico City time)`}</Text>
          <Text variant="xs" color="mutedForeground" style={{ marginTop: 4 }}>All amounts in Mexican pesos (MXN).</Text>
        </View>

        <PdfCard title="Totals" variant="muted" padding="lg" style={{ marginTop: 12 }}>
          <Total label="Total income" value={money(summary.income)} />
          <Total label="Total expenses (after refunds)" value={money(summary.expenses)} />
          <View style={{ borderTopWidth: 0.5, borderColor: theme.colors.border, marginTop: 4, paddingTop: 4 }}>
            <Total label="Net change" value={signedMoney(summary.netChange)} emphasis />
          </View>
        </PdfCard>

        <Heading level={2}>Spending by category</Heading>
        {summary.breakdown.length ? (
          <DataTable
            variant="line"
            columns={[
              { key: "category", header: "Category", width: "72%" },
              { key: "amount", header: "Amount", align: "right", width: "28%" },
            ]}
            data={summary.breakdown.map((group) => ({ category: group.category, amount: money(group.amount) }))}
          />
        ) : <Text color="mutedForeground">No expenses or refunds in this period.</Text>}

        <Heading level={2}>{`Financial movements (${summary.entries.length})`}</Heading>
        {summary.entries.length ? (
          <DataTable
            variant="striped" size="compact"
            columns={[
              { key: "date", header: "Date", width: 68 },
              { key: "kind", header: "Type", width: 55 },
              { key: "amount", header: "Amount", align: "right", width: 94 },
              { key: "category", header: "Category", width: 112 },
              { key: "note", header: "Note", width: 186 },
            ]}
            data={summary.entries.flatMap((entry) => noteRows(entry.note).map((note, index) => ({
              date: index ? "" : entry.date,
              kind: index ? "" : entryKindDetail(entry.kind)?.label ?? entry.kind,
              amount: index ? "" : money(signedAmount(entry)),
              category: index ? "" : entry.category.replace(/(\S{18})(?=\S)/gu, "$1\n"),
              note,
            })))}
          />
        ) : <Text color="mutedForeground">No financial movements in this period.</Text>}
      </Page>
    </Document>
  );
}
