-- Past budgets page backward from the newest ended periods. Reading one
-- owner's budgets of one kind by their last period, newest first, lets each
-- page read a bounded number of budget rows however long the history grows.
CREATE INDEX budget_history
  ON budget (owner_id, period_kind, last_period_start DESC NULLS FIRST);
