-- LaszyResearch — account_research table
--
-- Run this once in your Supabase project (Dashboard → SQL Editor → New Query).
-- The output agent upserts on account_id, so re-running the pipeline for
-- the same account updates the row rather than inserting a duplicate.

create extension if not exists "pgcrypto";

create table if not exists public.account_research (
  id                    uuid primary key default gen_random_uuid(),
  account_id            text unique not null,
  company_name          text not null,
  company_domain        text,
  score                 int check (score between 1 and 10),
  confidence            text check (confidence in ('high', 'medium', 'low')),
  rationale             text,
  key_evidence          jsonb,
  recommended_persona   text,
  message_angle         text,
  raw_research          jsonb,
  status                text default 'completed',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Useful indexes for the frontend (sort by score, filter by status/confidence)
create index if not exists account_research_score_idx
  on public.account_research (score desc);

create index if not exists account_research_status_idx
  on public.account_research (status);

create index if not exists account_research_updated_idx
  on public.account_research (updated_at desc);

-- Keep updated_at fresh on every upsert/update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists account_research_set_updated_at on public.account_research;
create trigger account_research_set_updated_at
  before update on public.account_research
  for each row
  execute function public.set_updated_at();

-- Row-level security: lock the table down by default, then allow the
-- service-role key (used by the pipeline) full access. If your frontend
-- reads via a separate anon key, add explicit read policies for it.
alter table public.account_research enable row level security;

drop policy if exists "service role full access" on public.account_research;
create policy "service role full access"
  on public.account_research
  for all
  to service_role
  using (true)
  with check (true);
