import "server-only";
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  entryKindDetail,
  money,
  periodLabel,
  signedAmount,
  signedMoney,
  type Summary,
} from "./financial";

// The snapshot is a downloaded file, never a stored or linked document, so the
// export date belongs in its name: the owner can tell two exports of the same
// period apart without opening them.
export function reportFileName(summary: Summary) {
  return `finance-buddy-${summary.kind}-${summary.start}-to-${summary.end}-exported-${summary.today}.pdf`;
}
// The standard fonts write WinAnsi, which cannot carry every character a note or
// a category name may hold. Anything outside it is marked rather than refused,
// so an export never fails on text the journal accepted.
function printable(text: string) {
  return text.replace(/[^ -~ -ÿ–—‘’“”•€]/gu, "?");
}
const page = { width: 595.28, height: 841.89, margin: 48 };
const content = page.width - page.margin * 2;
const line = 13;
// Every entry column: where it starts, how wide it is, and whether its text is
// aligned on the right the way amounts are read.
const columns = [
  { header: "Date", x: 0, width: 62 },
  { header: "Type", x: 66, width: 52 },
  { header: "Amount", x: 124, width: 86, right: true },
  { header: "Category", x: 218, width: 110 },
  { header: "Note", x: 336, width: content - 336 },
];

export async function reportDocument(summary: Summary) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const label = periodLabel(summary.kind, summary);
  document.setTitle(`Finance Buddy — ${label}`);
  let sheet!: PDFPage;
  let y = 0;
  function addPage() {
    sheet = document.addPage([page.width, page.height]);
    y = page.height - page.margin;
  }
  // Text is wrapped to its own column, and a word wider than the column is
  // broken rather than allowed to run past it.
  function wrap(text: string, font: PDFFont, size: number, width: number) {
    const lines: string[] = [];
    for (const paragraph of printable(text).split(/\r?\n/)) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        for (let piece = word; piece;) {
          let take = piece.length;
          while (
            take > 1 &&
            font.widthOfTextAtSize(piece.slice(0, take), size) > width
          )
            take--;
          const candidate = current
            ? `${current} ${piece.slice(0, take)}`
            : piece.slice(0, take);
          if (current && font.widthOfTextAtSize(candidate, size) > width) {
            lines.push(current);
            current = piece.slice(0, take);
          } else current = candidate;
          piece = piece.slice(take);
        }
      }
      lines.push(current);
    }
    return lines.length ? lines : [""];
  }
  function draw(
    text: string,
    {
      x = 0,
      size = 10,
      font = regular,
      width = content,
      right = false,
    }: {
      x?: number;
      size?: number;
      font?: PDFFont;
      width?: number;
      right?: boolean;
    } = {},
  ) {
    for (const row of wrap(text, font, size, width)) {
      sheet.drawText(row, {
        x:
          page.margin +
          x +
          (right ? width - font.widthOfTextAtSize(row, size) : 0),
        y,
        size,
        font,
      });
      y -= line;
    }
  }
  // A block starts on the page that can hold its first lines, so a heading is
  // never left alone at the foot of a page.
  function keep(height: number) {
    if (y - height < page.margin + line) addPage();
  }
  function heading(text: string) {
    keep(line * 3);
    y -= line / 2;
    draw(text, { size: 13, font: bold });
    y -= 4;
  }
  function amountRow(name: string, amount: string) {
    keep(line * 2);
    const top = y;
    draw(name, { width: content - 130 });
    const bottom = y;
    y = top;
    draw(amount, { x: content - 120, width: 120, right: true });
    y = Math.min(bottom, y);
  }

  addPage();
  draw("Finance Buddy — financial report", { size: 18, font: bold });
  y -= 6;
  // The period covered and the date the snapshot was taken are separate lines,
  // each named, so neither can be mistaken for the other.
  draw(`Period covered: ${label} (${summary.start} to ${summary.end})`, {
    size: 11,
  });
  draw(`Exported on ${summary.today} (Mexico City time)`, { size: 11 });
  draw("All amounts in Mexican pesos (MXN).", { size: 11 });

  heading("Totals");
  amountRow("Total income", money(summary.income));
  amountRow("Total expenses (after refunds)", money(summary.expenses));
  amountRow("Net change", signedMoney(summary.netChange));

  heading("Spending by category");
  if (summary.breakdown.length)
    for (const group of summary.breakdown)
      amountRow(group.category, money(group.amount));
  else draw("No expenses or refunds in this period.");

  heading(`Financial movements (${summary.entries.length})`);
  if (summary.entries.length) {
    // The column headings repeat on every page the list continues onto.
    let headed = 0;
    for (const entry of summary.entries) {
      const cells = [
        entry.date,
        entryKindDetail(entry.kind)?.label ?? entry.kind,
        money(signedAmount(entry)),
        entry.category,
        entry.note,
      ];
      const height =
        line *
        Math.max(
          ...cells.map(
            (cell, index) =>
              wrap(cell, regular, 9, columns[index].width).length,
          ),
        );
      keep(height + line * 2);
      if (headed !== document.getPageCount()) {
        headed = document.getPageCount();
        const top = y;
        for (const column of columns) {
          y = top;
          draw(column.header, { ...column, size: 9, font: bold });
        }
        y = top - line - 2;
      }
      const top = y;
      let bottom = y;
      for (const [index, cell] of cells.entries()) {
        y = top;
        draw(cell, { ...columns[index], size: 9 });
        bottom = Math.min(bottom, y);
      }
      y = bottom - 4;
    }
  } else draw("No financial movements in this period.");

  const pages = document.getPages();
  pages.forEach((each, index) =>
    each.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: page.margin,
      y: page.margin - line,
      size: 9,
      font: regular,
    }),
  );
  return document.save();
}
