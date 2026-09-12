"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { compactAmount, money, signedMoney } from "@/lib/financial";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Every chart here is drawn from percentages of a shared plot box: one hairline
// per axis tick, marks that grow from a single baseline, and a readout that
// names the exact figures for whichever mark is hovered or focused. Colour only
// ever carries identity, so a value is always also readable as text.
export type AxisTick = { label: string; offset: number };

// The widest a mark may be. Wider marks read as blocks rather than as data.
const markWidth = "w-full max-w-6";

function Plot({
  ticks,
  ticksLabel,
  children,
}: {
  ticks: AxisTick[];
  ticksLabel: string[];
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Narrow screens show a window onto the span rather than all of it. The most
  // recent period is the one being looked at, so the window opens on the right
  // edge and only moves again when the span itself changes.
  const span = ticksLabel.join();
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [span]);
  return (
    <div className="flex pt-3">
      {/* The scale stays put while the plot beside it scrolls, so a window onto
          the span is never a window without an axis. */}
      <div aria-hidden="true" className="relative h-56 w-12 shrink-0">
        {ticks.map((tick) => (
          <span
            key={tick.label + tick.offset}
            className="absolute right-0 -translate-y-1/2 pr-2 text-right text-[11px] tabular-nums text-muted-foreground"
            style={{ top: `${tick.offset}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
        <div className="min-w-[28rem]">
          <div className="relative h-56">
            {ticks.map((tick) => (
              <div
                key={tick.label + tick.offset}
                aria-hidden="true"
                className="absolute inset-x-0 h-px bg-chart-grid"
                style={{ top: `${tick.offset}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-stretch gap-1">
              {children}
            </div>
          </div>
          <div aria-hidden="true" className="mt-2 flex gap-1">
            {ticksLabel.map((label, index) => (
              <span
                key={`${label}-${index}`}
                className="flex-1 truncate text-center text-[11px] tabular-nums text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Identity never rests on colour alone: the legend names every series beside its
// own mark, and the readout repeats the figures as text.
export function Legend({
  series,
}: {
  series: { label: string; className: string }[];
}) {
  return (
    <ul className="flex flex-wrap gap-4">
      {series.map((entry) => (
        <li
          key={entry.label}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${entry.className}`}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

function Readout({ children }: { children: React.ReactNode }) {
  // The marks carry their own accessible names, so this line is a second copy
  // for sighted pointer and keyboard use and is not announced again.
  return (
    <p aria-hidden="true" className="min-h-10 text-sm">
      {children}
    </p>
  );
}

function Slot({
  label,
  active,
  onActive,
  children,
}: {
  label: string;
  active: boolean;
  onActive: (active: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      tabIndex={0}
      className={`flex flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-secondary/50" : ""}`}
      onMouseEnter={() => onActive(true)}
      onMouseLeave={() => onActive(false)}
      onFocus={() => onActive(true)}
      onBlur={() => onActive(false)}
    >
      {children}
    </div>
  );
}

// Two tick labels closer together than this overlap as text. Where an extreme
// sits almost on the zero line, the zero line keeps its label and the extreme
// gives up its own; the readout and the table still carry that figure.
const tickGap = 9;
function spacedTicks(ticks: AxisTick[], anchor: number) {
  return ticks.filter(
    (tick) =>
      tick.offset === anchor || Math.abs(tick.offset - anchor) >= tickGap,
  );
}

// A share of the tallest mark, floored so a small but real figure still draws.
function share(value: number, top: number) {
  return top > 0 ? Math.max(value / top, 0) * 100 : 0;
}

export type SeriesPoint = {
  label: string;
  tick: string;
  income: string;
  expenses: string;
  netChange: string;
};

// Income beside expenses, period by period: two series whose job is identity,
// so they take the first two categorical hues and touch only across a gap.
export function IncomeExpenseColumns({ points }: { points: SeriesPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const top = points.reduce(
    (highest, point) =>
      Math.max(highest, Number(point.income), Number(point.expenses)),
    0,
  );
  const shown = points[active ?? points.length - 1];
  return (
    <div className="flex flex-col gap-4">
      <Legend
        series={[
          { label: "Income", className: "bg-chart-income" },
          { label: "Expenses", className: "bg-chart-expenses" },
        ]}
      />
      <Readout>
        {shown && (
          <>
            <span className="font-medium">{shown.label}</span>
            <br />
            Income {money(shown.income)} · Expenses {money(shown.expenses)}
          </>
        )}
      </Readout>
      <Plot
        ticks={[
          { label: compactAmount(String(top)), offset: 0 },
          { label: compactAmount(String(top / 2)), offset: 50 },
          { label: "0", offset: 100 },
        ]}
        ticksLabel={points.map((point) => point.tick)}
      >
        {points.map((point, index) => (
          <Slot
            key={point.label}
            active={index === (active ?? points.length - 1)}
            onActive={(on) => setActive(on ? index : null)}
            label={`${point.label}. Income ${money(point.income)}. Expenses ${money(point.expenses)}.`}
          >
            <div className="flex w-full items-end justify-center gap-0.5 px-0.5">
              <span
                className={`${markWidth} rounded-t bg-chart-income ${Number(point.income) > 0 ? "min-h-0.5" : ""}`}
                style={{ height: `${share(Number(point.income), top)}%` }}
              />
              <span
                className={`${markWidth} rounded-t bg-chart-expenses ${Number(point.expenses) > 0 ? "min-h-0.5" : ""}`}
                style={{ height: `${share(Number(point.expenses), top)}%` }}
              />
            </div>
          </Slot>
        ))}
      </Plot>
    </div>
  );
}

// Net change is a polarity, not a magnitude, so it takes a diverging pair around
// a zero line placed where the data actually crosses it.
export function NetChangeColumns({ points }: { points: SeriesPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const values = points.map((point) => Number(point.netChange));
  const gained = Math.max(0, ...values);
  const lost = Math.max(0, ...values.map((value) => -value));
  const zero = gained + lost > 0 ? (gained / (gained + lost)) * 100 : 100;
  const shown = points[active ?? points.length - 1];
  return (
    <div className="flex flex-col gap-4">
      <Legend
        series={[
          { label: "Money gained", className: "bg-chart-gain" },
          { label: "Money spent down", className: "bg-chart-loss" },
        ]}
      />
      <Readout>
        {shown && (
          <>
            <span className="font-medium">{shown.label}</span>
            <br />
            Net change {signedMoney(shown.netChange)}
          </>
        )}
      </Readout>
      <Plot
        ticks={spacedTicks(
          [
            ...(gained > 0
              ? [{ label: compactAmount(String(gained)), offset: 0 }]
              : []),
            { label: "0", offset: zero },
            ...(lost > 0
              ? [{ label: `-${compactAmount(String(lost))}`, offset: 100 }]
              : []),
          ],
          zero,
        )}
        ticksLabel={points.map((point) => point.tick)}
      >
        {points.map((point, index) => {
          const value = Number(point.netChange);
          return (
            <Slot
              key={point.label}
              active={index === (active ?? points.length - 1)}
              onActive={(on) => setActive(on ? index : null)}
              label={`${point.label}. Net change ${signedMoney(point.netChange)}.`}
            >
              <div className="flex w-full flex-col px-0.5">
                <div
                  className="flex items-end justify-center"
                  style={{ height: `${zero}%` }}
                >
                  <span
                    className={`${markWidth} rounded-t bg-chart-gain ${value > 0 ? "min-h-0.5" : ""}`}
                    style={{
                      height: `${value > 0 ? share(value, gained) : 0}%`,
                    }}
                  />
                </div>
                <div
                  className="flex items-start justify-center"
                  style={{ height: `${100 - zero}%` }}
                >
                  <span
                    className={`${markWidth} rounded-b bg-chart-loss ${value < 0 ? "min-h-0.5" : ""}`}
                    style={{
                      height: `${value < 0 ? share(-value, lost) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </Slot>
          );
        })}
      </Plot>
    </div>
  );
}

export type CategoryBar = {
  categoryId: string | null;
  category: string;
  amount: string;
  previous: string;
};

// One measure, one hue: the bars compare spending groups against each other, and
// the sentence beside each one carries the comparison with the span before.
export function CategoryBars({
  categories,
  spanLabel,
}: {
  categories: CategoryBar[];
  spanLabel: string;
}) {
  const top = categories.reduce(
    (highest, group) => Math.max(highest, Number(group.amount)),
    0,
  );
  return (
    <ul className="flex flex-col gap-4">
      {categories.map((group) => (
        <li key={`${group.categoryId}:${group.category}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="break-words font-medium">{group.category}</span>
            <span className="tabular-nums">{money(group.amount)}</span>
          </div>
          {/* A group that a refund pushed below zero has no bar to draw; its
              figure is still stated above and in the table. */}
          <div className="mt-1 h-3 w-full rounded-sm bg-secondary">
            <span
              className="block h-3 rounded-r bg-chart-income"
              style={{ width: `${share(Math.max(0, Number(group.amount)), top)}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {money(group.previous)} in the {spanLabel} before.
          </p>
        </li>
      ))}
    </ul>
  );
}

// Every chart ships with the same figures as a table, so no value is reachable
// only by pointing at a mark.
export function TableView({
  caption,
  headings,
  rows,
}: {
  caption: string;
  headings: string[];
  rows: string[][];
}) {
  return (
    <Collapsible className="mt-6">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group -ml-3 text-muted-foreground"
        >
          <ChevronRight
            aria-hidden="true"
            className="transition-transform group-data-[state=open]:rotate-90"
          />
          Table view
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Table className="mt-3">
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              {headings.map((heading, index) => (
                <TableHead
                  key={heading}
                  scope="col"
                  className={index ? "text-right" : undefined}
                >
                  {heading}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row[0]}>
                <TableHead scope="row" className="font-normal">
                  {row[0]}
                </TableHead>
                {row.slice(1).map((cell, index) => (
                  <TableCell
                    key={`${row[0]}-${index}`}
                    className="text-right tabular-nums"
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
