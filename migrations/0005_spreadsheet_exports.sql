-- One row per explicit Google Sheets export. The row is claimed before the
-- spreadsheet is created, so a repeated identifier returns the finished
-- spreadsheet instead of creating a second one, and an attempt whose result
-- never arrived stays distinguishable from a completed snapshot.
CREATE TABLE spreadsheet_export (
  id uuid NOT NULL,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  period_kind text NOT NULL CHECK (period_kind IN ('day', 'week', 'month')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  export_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'unconfirmed')),
  spreadsheet_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id),
  CONSTRAINT spreadsheet_export_complete
    CHECK ((status = 'complete') = (spreadsheet_url IS NOT NULL))
);
