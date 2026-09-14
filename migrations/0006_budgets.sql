-- A budget row covers a span of consecutive periods of one kind rather than one
-- row per period, so nothing is generated on a schedule and the budget for any
-- period is resolved when it is read. A null last period start leaves a
-- repeating budget open-ended; a one-off budget spans exactly one period.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE budget (
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  period_kind text NOT NULL CHECK (period_kind IN ('day', 'week', 'month')),
  first_period_start date NOT NULL,
  last_period_start date,
  repeats boolean NOT NULL,
  amount_centavos bigint NOT NULL CHECK (amount_centavos >= 0 AND amount_centavos <= 99999999999999),
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, period_kind, repeats, first_period_start),
  -- Weeks start on a Monday and months on the 1st, as summaries resolve them.
  CONSTRAINT budget_period_aligned CHECK (
    period_kind = 'day' OR (
      first_period_start = date_trunc(period_kind, first_period_start::timestamp)::date
      AND (last_period_start IS NULL
        OR last_period_start = date_trunc(period_kind, last_period_start::timestamp)::date))),
  CONSTRAINT budget_span_order
    CHECK (last_period_start IS NULL OR last_period_start >= first_period_start),
  CONSTRAINT budget_one_off_span
    CHECK (repeats OR last_period_start = first_period_start),
  -- Repeating spans never overlap, and a period has at most one one-off budget.
  CONSTRAINT budget_no_overlap EXCLUDE USING gist (
    owner_id WITH =,
    period_kind WITH =,
    repeats WITH =,
    daterange(first_period_start, last_period_start, '[]') WITH &&
  )
);
