-- Migration: rename brainstorm2_* tables to brainstorm_* and drop the old brainstorm module tables.
-- Run this once in Supabase SQL Editor.
--
-- Context: the new brainstorm module was originally scaffolded as "brainstorm2".
-- The old brainstorm module's tables (brainstorm_boards/nodes/connections) had a
-- different schema and are no longer used.

begin;

-- 1. Drop the OLD brainstorm module tables (different schema, orphaned).
drop table if exists brainstorm_connections cascade;
drop table if exists brainstorm_nodes cascade;
drop table if exists brainstorm_boards cascade;

-- 2. Rename the brainstorm2_* tables to brainstorm_*.
alter table brainstorm2_boards rename to brainstorm_boards;
alter table brainstorm2_nodes  rename to brainstorm_nodes;
alter table brainstorm2_edges  rename to brainstorm_edges;

-- 3. Rename indexes.
alter index idx_brainstorm2_boards_user_id       rename to idx_brainstorm_boards_user_id;
alter index idx_brainstorm2_boards_user_updated  rename to idx_brainstorm_boards_user_updated;
alter index idx_brainstorm2_nodes_board_id       rename to idx_brainstorm_nodes_board_id;
alter index idx_brainstorm2_nodes_user_board     rename to idx_brainstorm_nodes_user_board;
alter index idx_brainstorm2_edges_board_id       rename to idx_brainstorm_edges_board_id;
alter index idx_brainstorm2_edges_user_board     rename to idx_brainstorm_edges_user_board;
alter index idx_brainstorm2_edges_source         rename to idx_brainstorm_edges_source;
alter index idx_brainstorm2_edges_target         rename to idx_brainstorm_edges_target;

-- 4. Rename constraints (unique + check).
alter table brainstorm_edges rename constraint brainstorm2_edges_unique_pair  to brainstorm_edges_unique_pair;
alter table brainstorm_edges rename constraint brainstorm2_edges_no_self_loop to brainstorm_edges_no_self_loop;

-- 5. Rename RLS policies (Postgres requires drop+recreate; the table rename keeps them attached but with old names).
alter policy brainstorm2_boards_rls_select on brainstorm_boards rename to brainstorm_boards_rls_select;
alter policy brainstorm2_boards_rls_insert on brainstorm_boards rename to brainstorm_boards_rls_insert;
alter policy brainstorm2_boards_rls_update on brainstorm_boards rename to brainstorm_boards_rls_update;
alter policy brainstorm2_boards_rls_delete on brainstorm_boards rename to brainstorm_boards_rls_delete;

alter policy brainstorm2_nodes_rls_select on brainstorm_nodes rename to brainstorm_nodes_rls_select;
alter policy brainstorm2_nodes_rls_insert on brainstorm_nodes rename to brainstorm_nodes_rls_insert;
alter policy brainstorm2_nodes_rls_update on brainstorm_nodes rename to brainstorm_nodes_rls_update;
alter policy brainstorm2_nodes_rls_delete on brainstorm_nodes rename to brainstorm_nodes_rls_delete;

alter policy brainstorm2_edges_rls_select on brainstorm_edges rename to brainstorm_edges_rls_select;
alter policy brainstorm2_edges_rls_insert on brainstorm_edges rename to brainstorm_edges_rls_insert;
alter policy brainstorm2_edges_rls_update on brainstorm_edges rename to brainstorm_edges_rls_update;
alter policy brainstorm2_edges_rls_delete on brainstorm_edges rename to brainstorm_edges_rls_delete;

commit;
