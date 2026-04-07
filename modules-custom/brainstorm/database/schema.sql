-- Brainstorm module schema
-- Run this once in Supabase SQL Editor.

create table if not exists brainstorm_boards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user"(id) on delete cascade,
  name varchar(200) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_brainstorm_boards_user_id on brainstorm_boards (user_id);
create index if not exists idx_brainstorm_boards_user_updated on brainstorm_boards (user_id, updated_at desc);

alter table brainstorm_boards enable row level security;
create policy brainstorm_boards_rls_select on brainstorm_boards for select using (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_boards_rls_insert on brainstorm_boards for insert with check (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_boards_rls_update on brainstorm_boards for update using (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_boards_rls_delete on brainstorm_boards for delete using (user_id = (select current_setting('app.current_user_id')));

create table if not exists brainstorm_nodes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references brainstorm_boards(id) on delete cascade,
  user_id text not null references public."user"(id) on delete cascade,
  text text not null default '',
  x double precision not null default 0,
  y double precision not null default 0,
  color varchar(32) not null default 'slate',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_brainstorm_nodes_board_id on brainstorm_nodes (board_id);
create index if not exists idx_brainstorm_nodes_user_board on brainstorm_nodes (user_id, board_id);

alter table brainstorm_nodes enable row level security;
create policy brainstorm_nodes_rls_select on brainstorm_nodes for select using (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_nodes_rls_insert on brainstorm_nodes for insert with check (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_nodes_rls_update on brainstorm_nodes for update using (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_nodes_rls_delete on brainstorm_nodes for delete using (user_id = (select current_setting('app.current_user_id')));

create table if not exists brainstorm_edges (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references brainstorm_boards(id) on delete cascade,
  user_id text not null references public."user"(id) on delete cascade,
  source_node_id uuid not null references brainstorm_nodes(id) on delete cascade,
  target_node_id uuid not null references brainstorm_nodes(id) on delete cascade,
  created_at timestamptz default now(),
  constraint brainstorm_edges_no_self_loop check (source_node_id <> target_node_id),
  constraint brainstorm_edges_unique_pair unique (board_id, source_node_id, target_node_id)
);
create index if not exists idx_brainstorm_edges_board_id on brainstorm_edges (board_id);
create index if not exists idx_brainstorm_edges_user_board on brainstorm_edges (user_id, board_id);
create index if not exists idx_brainstorm_edges_source on brainstorm_edges (source_node_id);
create index if not exists idx_brainstorm_edges_target on brainstorm_edges (target_node_id);

alter table brainstorm_edges enable row level security;
create policy brainstorm_edges_rls_select on brainstorm_edges for select using (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_edges_rls_insert on brainstorm_edges for insert with check (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_edges_rls_update on brainstorm_edges for update using (user_id = (select current_setting('app.current_user_id')));
create policy brainstorm_edges_rls_delete on brainstorm_edges for delete using (user_id = (select current_setting('app.current_user_id')));
