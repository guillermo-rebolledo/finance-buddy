CREATE TABLE category_seed (
  owner_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE category (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (owner_id, id, kind)
);
CREATE TABLE financial_movement (
  id uuid NOT NULL,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  amount_centavos bigint NOT NULL CHECK (amount_centavos > 0 AND amount_centavos <= 99999999999999),
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  movement_date date NOT NULL,
  category_id uuid,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, category_id, kind) REFERENCES category(owner_id, id, kind)
);
CREATE INDEX financial_movement_period ON financial_movement(owner_id, movement_date DESC, created_at DESC, id);
