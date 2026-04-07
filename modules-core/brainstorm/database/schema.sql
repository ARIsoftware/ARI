-- Brainstorm module schema
-- Idempotent: safe to run on every module enable.

CREATE TABLE IF NOT EXISTS brainstorm_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brainstorm_boards_user_id ON brainstorm_boards (user_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_boards_user_updated ON brainstorm_boards (user_id, updated_at DESC);

ALTER TABLE brainstorm_boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brainstorm_boards_rls_select ON brainstorm_boards;
CREATE POLICY brainstorm_boards_rls_select ON brainstorm_boards FOR SELECT USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_boards_rls_insert ON brainstorm_boards;
CREATE POLICY brainstorm_boards_rls_insert ON brainstorm_boards FOR INSERT WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_boards_rls_update ON brainstorm_boards;
CREATE POLICY brainstorm_boards_rls_update ON brainstorm_boards FOR UPDATE USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_boards_rls_delete ON brainstorm_boards;
CREATE POLICY brainstorm_boards_rls_delete ON brainstorm_boards FOR DELETE USING (user_id = (SELECT current_setting('app.current_user_id')));

CREATE TABLE IF NOT EXISTS brainstorm_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES brainstorm_boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  color VARCHAR(32) NOT NULL DEFAULT 'slate',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brainstorm_nodes_board_id ON brainstorm_nodes (board_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_nodes_user_board ON brainstorm_nodes (user_id, board_id);

ALTER TABLE brainstorm_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brainstorm_nodes_rls_select ON brainstorm_nodes;
CREATE POLICY brainstorm_nodes_rls_select ON brainstorm_nodes FOR SELECT USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_nodes_rls_insert ON brainstorm_nodes;
CREATE POLICY brainstorm_nodes_rls_insert ON brainstorm_nodes FOR INSERT WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_nodes_rls_update ON brainstorm_nodes;
CREATE POLICY brainstorm_nodes_rls_update ON brainstorm_nodes FOR UPDATE USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_nodes_rls_delete ON brainstorm_nodes;
CREATE POLICY brainstorm_nodes_rls_delete ON brainstorm_nodes FOR DELETE USING (user_id = (SELECT current_setting('app.current_user_id')));

CREATE TABLE IF NOT EXISTS brainstorm_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES brainstorm_boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES brainstorm_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES brainstorm_nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT brainstorm_edges_no_self_loop CHECK (source_node_id <> target_node_id),
  CONSTRAINT brainstorm_edges_unique_pair UNIQUE (board_id, source_node_id, target_node_id)
);
CREATE INDEX IF NOT EXISTS idx_brainstorm_edges_board_id ON brainstorm_edges (board_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_edges_user_board ON brainstorm_edges (user_id, board_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_edges_source ON brainstorm_edges (source_node_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_edges_target ON brainstorm_edges (target_node_id);

ALTER TABLE brainstorm_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brainstorm_edges_rls_select ON brainstorm_edges;
CREATE POLICY brainstorm_edges_rls_select ON brainstorm_edges FOR SELECT USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_edges_rls_insert ON brainstorm_edges;
CREATE POLICY brainstorm_edges_rls_insert ON brainstorm_edges FOR INSERT WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_edges_rls_update ON brainstorm_edges;
CREATE POLICY brainstorm_edges_rls_update ON brainstorm_edges FOR UPDATE USING (user_id = (SELECT current_setting('app.current_user_id')));
DROP POLICY IF EXISTS brainstorm_edges_rls_delete ON brainstorm_edges;
CREATE POLICY brainstorm_edges_rls_delete ON brainstorm_edges FOR DELETE USING (user_id = (SELECT current_setting('app.current_user_id')));
