create table if not exists public.event_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  timeline jsonb not null,
  energy_progression jsonb not null,
  recommended_genres text[] not null default '{}',
  starter_playlist text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists event_plans_event_id_idx on public.event_plans (event_id);
create index if not exists event_plans_user_id_idx on public.event_plans (user_id);

alter table public.event_plans enable row level security;

drop policy if exists users_can_select_own_event_plans on public.event_plans;
create policy users_can_select_own_event_plans
on public.event_plans
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists users_can_insert_own_event_plans on public.event_plans;
create policy users_can_insert_own_event_plans
on public.event_plans
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists users_can_update_own_event_plans on public.event_plans;
create policy users_can_update_own_event_plans
on public.event_plans
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists users_can_delete_own_event_plans on public.event_plans;
create policy users_can_delete_own_event_plans
on public.event_plans
for delete
to authenticated
using (auth.uid() = user_id);
