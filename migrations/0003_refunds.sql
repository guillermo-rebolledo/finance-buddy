-- Refunds are recorded as positive amounts, reduce expenses on their own movement
-- date, and reuse the owner's expense categories.
ALTER TABLE financial_movement
  DROP CONSTRAINT financial_movement_kind_check,
  ADD CONSTRAINT financial_movement_kind_check CHECK (kind IN ('income', 'expense', 'refund')),
  DROP CONSTRAINT financial_movement_owner_id_category_id_kind_fkey,
  ADD COLUMN category_kind text NOT NULL
    GENERATED ALWAYS AS (CASE WHEN kind = 'income' THEN 'income' ELSE 'expense' END) STORED,
  ADD FOREIGN KEY (owner_id, category_id, category_kind) REFERENCES category(owner_id, id, kind);
