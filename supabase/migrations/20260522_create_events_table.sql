create extension if not exists "pgcrypto";

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null,
  event_type text not null,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  crowd_size integer not null check (crowd_size > 0),
  genres text[] not null default '{}',
  energy_level integer not null check (energy_level between 1 and 10),
  created_at timestamptz not null default now()
);

create index if not exists events_user_id_idx on public.events (user_id);
create index if not exists events_event_date_idx on public.events (event_date);

alter table public.events enable row level security;

drop policy if exists "users_can_select_own_events" on public.events;
create policy "users_can_select_own_events"
on public.events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_events" on public.events;
create policy "users_can_insert_own_events"
on public.events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_events" on public.events;
create policy "users_can_update_own_events"
on public.events
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users_can_delete_own_events" on public.events;
create policy "users_can_delete_own_events"
on public.events
for delete
to authenticated
using (auth.uid() = user_id);
