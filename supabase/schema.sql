-- LaszyResearch backend schema
--
-- Supabase Claude MCP command:
-- Use the Supabase MCP `execute_sql` tool and pass this whole file as `query`.
--
-- The schema is idempotent. It can be re-run while we iterate on agents/tools.

create extension if not exists "pgcrypto";

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

-- 1. Source accounts table.
-- Mirrors the CSV export fields while giving every account a stable UUID for tools.
create table if not exists public.accounts (
  id                                      uuid primary key default gen_random_uuid(),
  source_system                           text not null default 'csv',
  external_account_id                     text unique,
  company_name                            text not null,
  normalized_domain                       text,
  website                                 text,
  linkedin_url                            text,
  salesforce_url                          text,
  country                                 text,
  industry                                text,
  vertical                                text,
  account_segment                         text,
  core_non_core                           text,
  linkedin_headcount                      integer,
  headcount_growth                        numeric,
  knowledge_workers                       integer,
  knowledge_workers_pct_of_headcount      numeric,
  revenue_best                            numeric,
  oppty_count                             integer,
  open_opportunity_count                  integer,
  most_recent_open_opportunity_close_date date,
  shared_investor                         text,
  invited_bdr                             text,
  pipeline_owner                          text,
  actively_account_score                  numeric,
  actively_account_explanation            text,
  latest_funding_date                     date,
  bdr_prospecting_notes                   text,
  ae_prospecting_notes                    text,
  return_date                             date,
  return_reason                           text,
  parent_account                          text,
  parent_child                            text,
  child_type                              text,
  parent_child_reasoning                  text,
  identified_tech_stack                   text[],
  raw_import                              jsonb not null default '{}'::jsonb,
  created_at                              timestamptz not null default now(),
  updated_at                              timestamptz not null default now()
);

alter table public.accounts
  add column if not exists source_system text not null default 'csv',
  add column if not exists external_account_id text,
  add column if not exists normalized_domain text,
  add column if not exists salesforce_url text,
  add column if not exists country text,
  add column if not exists industry text,
  add column if not exists vertical text,
  add column if not exists account_segment text,
  add column if not exists core_non_core text,
  add column if not exists linkedin_headcount integer,
  add column if not exists headcount_growth numeric,
  add column if not exists knowledge_workers integer,
  add column if not exists knowledge_workers_pct_of_headcount numeric,
  add column if not exists revenue_best numeric,
  add column if not exists oppty_count integer,
  add column if not exists open_opportunity_count integer,
  add column if not exists most_recent_open_opportunity_close_date date,
  add column if not exists shared_investor text,
  add column if not exists invited_bdr text,
  add column if not exists pipeline_owner text,
  add column if not exists actively_account_score numeric,
  add column if not exists actively_account_explanation text,
  add column if not exists latest_funding_date date,
  add column if not exists bdr_prospecting_notes text,
  add column if not exists ae_prospecting_notes text,
  add column if not exists return_date date,
  add column if not exists return_reason text,
  add column if not exists parent_account text,
  add column if not exists parent_child text,
  add column if not exists child_type text,
  add column if not exists parent_child_reasoning text,
  add column if not exists identified_tech_stack text[],
  add column if not exists linkedin_url text,
  add column if not exists raw_import jsonb not null default '{}'::jsonb;

create unique index if not exists accounts_external_account_id_idx
  on public.accounts (external_account_id)
  where external_account_id is not null;

create index if not exists accounts_normalized_domain_idx
  on public.accounts (normalized_domain);

create index if not exists accounts_linkedin_url_idx
  on public.accounts (linkedin_url);

create index if not exists accounts_country_segment_idx
  on public.accounts (country, account_segment);

-- 2. Final scored account output used by the output agent.
create table if not exists public.account_research (
  id                    uuid primary key default gen_random_uuid(),
  account_uuid           uuid references public.accounts(id) on delete set null,
  account_id             text unique not null,
  company_name           text not null,
  company_domain         text,
  score                  int check (score between 0 and 100),
  confidence             text check (confidence in ('high', 'medium', 'low')),
  criteria_scores        jsonb,
  rationale              text,
  evidence_for           jsonb,
  evidence_against       jsonb,
  key_evidence           jsonb,
  scorecard              jsonb,
  top_signals            jsonb,
  cap_applied            text,
  recommended_persona    text,
  message_angle          text,
  raw_research           jsonb,
  status                 text default 'completed',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.account_research
  add column if not exists account_uuid uuid references public.accounts(id) on delete set null,
  add column if not exists criteria_scores jsonb,
  add column if not exists evidence_for jsonb,
  add column if not exists evidence_against jsonb,
  add column if not exists scorecard jsonb,
  add column if not exists top_signals jsonb,
  add column if not exists cap_applied text;

alter table public.account_research
  drop constraint if exists account_research_score_check;

alter table public.account_research
  add constraint account_research_score_check check (score between 0 and 100);

create index if not exists account_research_account_uuid_idx
  on public.account_research (account_uuid);

create index if not exists account_research_score_idx
  on public.account_research (score desc);

create index if not exists account_research_status_idx
  on public.account_research (status);

create index if not exists account_research_updated_idx
  on public.account_research (updated_at desc);

-- 3. Web research cache.
create table if not exists public.web_research_cache (
  domain         text primary key,
  account_uuid   uuid references public.accounts(id) on delete set null,
  company_name   text,
  research       jsonb not null default '{}'::jsonb,
  raw_response   jsonb not null default '{}'::jsonb,
  fetched_at     timestamptz not null default now(),
  refresh_count  integer not null default 0,
  last_error     text,
  last_error_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists web_research_cache_fetched_idx
  on public.web_research_cache (fetched_at desc);

-- 4. LinkedIn profile cache for Apify/person lookups.
create table if not exists public.linkedin_profile_cache (
  profile_url    text primary key,
  profile        jsonb not null default '{}'::jsonb,
  raw_response   jsonb not null default '{}'::jsonb,
  fetched_at     timestamptz not null default now(),
  refresh_count  integer not null default 0,
  last_error     text,
  last_error_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists linkedin_profile_cache_fetched_idx
  on public.linkedin_profile_cache (fetched_at desc);

-- 5. Account-level LinkedIn stakeholder research output.
create table if not exists public.account_linkedin_research (
  account_uuid      uuid primary key references public.accounts(id) on delete cascade,
  company_linkedin_url text,
  stakeholders      jsonb not null default '[]'::jsonb,
  raw_agent_output  jsonb not null default '{}'::jsonb,
  fetched_at        timestamptz not null default now(),
  refresh_count     integer not null default 0,
  last_error        text,
  last_error_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 6. TheirStack hiring cache.
-- Keyed by normalized company LinkedIn URL so duplicated domains/regions share one paid lookup.
create table if not exists public.company_hiring_signals (
  company_linkedin_url text primary key,
  domain               text,
  jobs                 jsonb not null default '[]'::jsonb,
  raw_jobs             jsonb not null default '[]'::jsonb,
  response_metadata    jsonb not null default '{}'::jsonb,
  company_object       jsonb,
  raw_response         jsonb not null default '{}'::jsonb,
  jobs_count           integer not null default 0,
  fetched_at           timestamptz not null default now(),
  refresh_count        integer not null default 0,
  last_error           text,
  last_error_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.company_hiring_signals
  add column if not exists raw_jobs jsonb not null default '[]'::jsonb,
  add column if not exists response_metadata jsonb not null default '{}'::jsonb,
  add column if not exists company_object jsonb,
  add column if not exists raw_response jsonb not null default '{}'::jsonb;

create index if not exists company_hiring_signals_domain_idx
  on public.company_hiring_signals (domain);

create index if not exists company_hiring_signals_fetched_idx
  on public.company_hiring_signals (fetched_at desc);

do $$
declare
  primary_key_exists boolean;
begin
  select exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'company_hiring_signals'
      and c.contype = 'p'
  ) into primary_key_exists;

  if not primary_key_exists then
    if exists (
      select 1
      from public.company_hiring_signals
      where company_linkedin_url is null
    ) then
      raise exception
        'company_hiring_signals has null company_linkedin_url values; populate them before adding primary key';
    end if;

    if exists (
      select 1
      from public.company_hiring_signals
      group by company_linkedin_url
      having count(*) > 1
    ) then
      raise exception
        'company_hiring_signals has duplicate company_linkedin_url values; dedupe before adding primary key';
    end if;

    alter table public.company_hiring_signals
      add constraint company_hiring_signals_pkey primary key (company_linkedin_url);
  end if;
end;
$$;

-- 7. Serper/report finder search cache.
create table if not exists public.report_search_cache (
  cache_key        text primary key,
  account_uuid     uuid references public.accounts(id) on delete set null,
  company_name     text not null,
  domain           text,
  candidates       jsonb not null default '[]'::jsonb,
  selected_url     text,
  finder_result    jsonb not null default '{}'::jsonb,
  raw_search       jsonb not null default '{}'::jsonb,
  fetched_at       timestamptz not null default now(),
  refresh_count    integer not null default 0,
  last_error       text,
  last_error_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists report_search_cache_domain_idx
  on public.report_search_cache (domain);

create index if not exists report_search_cache_fetched_idx
  on public.report_search_cache (fetched_at desc);

-- 8. Companies House filings cache.
create table if not exists public.companies_house_filings_cache (
  company_number  text primary key,
  filings         jsonb not null default '[]'::jsonb,
  raw_response    jsonb not null default '{}'::jsonb,
  fetched_at      timestamptz not null default now(),
  refresh_count   integer not null default 0,
  last_error      text,
  last_error_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 9. Downloaded/extracted report documents.
create table if not exists public.report_documents (
  id                uuid primary key default gen_random_uuid(),
  account_uuid       uuid references public.accounts(id) on delete set null,
  company_name       text not null,
  domain             text,
  source_url         text not null unique,
  document_type      text check (document_type in ('annual_report', 'interim_report', 'quarterly_report')),
  report_year        text,
  text_content       text,
  content_sha256     text,
  finder_result      jsonb not null default '{}'::jsonb,
  extracted_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists report_documents_account_idx
  on public.report_documents (account_uuid);

create index if not exists report_documents_year_idx
  on public.report_documents (report_year);

-- 10. Structured report analyst output.
create table if not exists public.report_intelligence (
  id                           uuid primary key default gen_random_uuid(),
  account_uuid                  uuid references public.accounts(id) on delete cascade,
  report_document_id            uuid references public.report_documents(id) on delete set null,
  company_name                  text not null,
  report_year                   text,
  document_type                 text,
  management_priorities         text[] not null default array[]::text[],
  transformation_initiatives    text[] not null default array[]::text[],
  procurement_signals           text[] not null default array[]::text[],
  cost_programs                 text[] not null default array[]::text[],
  pe_signals                    text[] not null default array[]::text[],
  zip_relevant_quotes           text[] not null default array[]::text[],
  confidence                    numeric check (confidence >= 0 and confidence <= 1),
  summary                       text,
  raw_analysis                  jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists report_intelligence_account_idx
  on public.report_intelligence (account_uuid);

create index if not exists report_intelligence_confidence_idx
  on public.report_intelligence (confidence desc);

-- 11. Pipeline and observability tables.
create table if not exists public.pipeline_runs (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'running',
  input_source   text,
  accounts_count integer,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references public.pipeline_runs(id) on delete set null,
  account_uuid    uuid references public.accounts(id) on delete set null,
  agent_name      text not null,
  model           text,
  status          text not null default 'running',
  input           jsonb not null default '{}'::jsonb,
  output          jsonb not null default '{}'::jsonb,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists agent_runs_account_idx
  on public.agent_runs (account_uuid);

create index if not exists agent_runs_agent_status_idx
  on public.agent_runs (agent_name, status);

create table if not exists public.tool_runs (
  id             uuid primary key default gen_random_uuid(),
  agent_run_id    uuid references public.agent_runs(id) on delete set null,
  account_uuid    uuid references public.accounts(id) on delete set null,
  tool_name       text not null,
  cache_key       text,
  status          text not null default 'running',
  input           jsonb not null default '{}'::jsonb,
  output          jsonb not null default '{}'::jsonb,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tool_runs_account_idx
  on public.tool_runs (account_uuid);

create index if not exists tool_runs_tool_status_idx
  on public.tool_runs (tool_name, status);

-- Attach updated_at triggers.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts',
    'account_research',
    'web_research_cache',
    'linkedin_profile_cache',
    'account_linkedin_research',
    'company_hiring_signals',
    'report_search_cache',
    'companies_house_filings_cache',
    'report_documents',
    'report_intelligence',
    'pipeline_runs',
    'agent_runs',
    'tool_runs'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

-- Service-role RLS policies for backend tools.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts',
    'account_research',
    'web_research_cache',
    'linkedin_profile_cache',
    'account_linkedin_research',
    'company_hiring_signals',
    'report_search_cache',
    'companies_house_filings_cache',
    'report_documents',
    'report_intelligence',
    'pipeline_runs',
    'agent_runs',
    'tool_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "service role full access" on public.%I', table_name);
    execute format(
      'create policy "service role full access" on public.%I for all to service_role using (true) with check (true)',
      table_name
    );
  end loop;
end;
$$;
