create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  user_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  text text not null check (char_length(text) between 1 and 140),
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_overrides (
  day text primary key check (day in ('Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница')),
  lessons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sent_events (
  event_key text primary key,
  sent_at timestamptz not null default now()
);

alter table public.devices enable row level security;
alter table public.announcements enable row level security;
alter table public.schedule_overrides enable row level security;
alter table public.sent_events enable row level security;

-- Доступ к таблицам идёт только через Edge Function с service role key.
-- Публичных RLS-политик специально нет.
