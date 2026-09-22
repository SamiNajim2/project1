-- Zeno Meeting Intelligence schema. Idempotent: safe to run on every boot.
create schema if not exists zeno;

create table if not exists zeno.meetings (
  id          uuid primary key,
  bot_id      text unique,
  status      text not null,
  demo        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);

create table if not exists zeno.utterances (
  id          uuid primary key,
  meeting_id  uuid not null references zeno.meetings(id) on delete cascade,
  is_final    boolean not null,
  received_at timestamptz not null,
  data        jsonb not null
);
create index if not exists utterances_meeting_idx on zeno.utterances (meeting_id, received_at);

create table if not exists zeno.chat_messages (
  id          uuid primary key,
  meeting_id  uuid not null references zeno.meetings(id) on delete cascade,
  from_bot    boolean not null,
  created_at  timestamptz not null,
  data        jsonb not null
);
create index if not exists chat_messages_meeting_idx on zeno.chat_messages (meeting_id, created_at);

create table if not exists zeno.commands (
  id          uuid primary key,
  meeting_id  uuid not null references zeno.meetings(id) on delete cascade,
  status      text not null,
  created_at  timestamptz not null,
  data        jsonb not null
);
create index if not exists commands_meeting_idx on zeno.commands (meeting_id, created_at);

create table if not exists zeno.approvals (
  id          uuid primary key,
  meeting_id  uuid not null references zeno.meetings(id) on delete cascade,
  status      text not null,
  created_at  timestamptz not null,
  expires_at  timestamptz not null,
  data        jsonb not null
);
create index if not exists approvals_meeting_idx on zeno.approvals (meeting_id, created_at);

create table if not exists zeno.audit_events (
  id          uuid primary key,
  meeting_id  uuid,
  created_at  timestamptz not null,
  data        jsonb not null
);
create index if not exists audit_events_meeting_idx on zeno.audit_events (meeting_id, created_at);

create table if not exists zeno.reports (
  meeting_id  uuid primary key references zeno.meetings(id) on delete cascade,
  created_at  timestamptz not null,
  data        jsonb not null
);

-- The mock Jira workspace is a single document so a write is one atomic row update.
create table if not exists zeno.jira_workspace (
  id          int primary key,
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);
