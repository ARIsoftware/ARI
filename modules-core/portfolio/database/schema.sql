-- Portfolio module schema
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/portfolio/database/schema.ts

CREATE TABLE IF NOT EXISTS portfolio_tickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  shares NUMERIC(20, 8),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portfolio_tickers_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
  CONSTRAINT portfolio_tickers_symbol_len_check CHECK (char_length(symbol) <= 10),
  CONSTRAINT portfolio_tickers_shares_nonneg_check CHECK (shares IS NULL OR shares >= 0),
  CONSTRAINT portfolio_tickers_position_nonneg_check CHECK (position >= 0)
);

ALTER TABLE portfolio_tickers ADD COLUMN IF NOT EXISTS shares NUMERIC(20, 8);

-- Upgrade path for installs created before symbol became TEXT
-- (varchar -> text is a metadata-only change; re-running is a no-op).
ALTER TABLE portfolio_tickers ALTER COLUMN symbol TYPE TEXT;

-- Upgrade path: add constraints to pre-existing installs. ADD CONSTRAINT has
-- no IF NOT EXISTS, so guard via pg_constraint. NOT VALID keeps the enable
-- from failing on legacy rows while still enforcing all new writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_tickers_user_id_fkey' AND conrelid = 'portfolio_tickers'::regclass
  ) THEN
    ALTER TABLE portfolio_tickers
      ADD CONSTRAINT portfolio_tickers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_tickers_symbol_len_check' AND conrelid = 'portfolio_tickers'::regclass
  ) THEN
    ALTER TABLE portfolio_tickers
      ADD CONSTRAINT portfolio_tickers_symbol_len_check
      CHECK (char_length(symbol) <= 10) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_tickers_shares_nonneg_check' AND conrelid = 'portfolio_tickers'::regclass
  ) THEN
    ALTER TABLE portfolio_tickers
      ADD CONSTRAINT portfolio_tickers_shares_nonneg_check
      CHECK (shares IS NULL OR shares >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'portfolio_tickers_position_nonneg_check' AND conrelid = 'portfolio_tickers'::regclass
  ) THEN
    ALTER TABLE portfolio_tickers
      ADD CONSTRAINT portfolio_tickers_position_nonneg_check
      CHECK (position >= 0) NOT VALID;
  END IF;
END $$;

-- The plain user_id index is redundant: both composite indexes below lead
-- with user_id. Dropped for installs that still have it.
DROP INDEX IF EXISTS idx_portfolio_tickers_user_id;

CREATE INDEX IF NOT EXISTS idx_portfolio_tickers_user_position ON portfolio_tickers(user_id, position ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_tickers_user_symbol ON portfolio_tickers(user_id, symbol);

ALTER TABLE portfolio_tickers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolio_tickers_rls_select ON portfolio_tickers;
CREATE POLICY portfolio_tickers_rls_select ON portfolio_tickers FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS portfolio_tickers_rls_insert ON portfolio_tickers;
CREATE POLICY portfolio_tickers_rls_insert ON portfolio_tickers FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS portfolio_tickers_rls_update ON portfolio_tickers;
CREATE POLICY portfolio_tickers_rls_update ON portfolio_tickers FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS portfolio_tickers_rls_delete ON portfolio_tickers;
CREATE POLICY portfolio_tickers_rls_delete ON portfolio_tickers FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));
