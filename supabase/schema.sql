-- Questlog database: one table of JSON documents, each row private to the signed-in user who owns it.
create table if not exists public.docs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

alter table public.docs enable row level security;

drop policy if exists "Users manage their own docs" on public.docs;
create policy "Users manage their own docs" on public.docs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.docs to authenticated;
grant all on public.docs to service_role;

-- Live updates between your phone and laptop.
alter table public.docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null;
end $$;
