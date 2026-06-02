-- Saessak Platform credit ledger schema
-- Supabase SQL Editor에서 실행한 뒤 Vercel 환경 변수 CLAUDE_REQUIRE_CREDITS=true 를 켜면
-- Claude API가 서버 DB 잔액 기준으로만 실행되도록 전환할 수 있습니다.

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  balance integer not null default 0 check (balance >= 0),
  is_unlimited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  feature text not null,
  amount integer not null,
  balance_after integer,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "Users can read own credit balance" on public.user_credits;
create policy "Users can read own credit balance"
on public.user_credits
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own credit ledger" on public.credit_ledger;
create policy "Users can read own credit ledger"
on public.credit_ledger
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.touch_user_credits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_credits_touch_updated_at on public.user_credits;
create trigger user_credits_touch_updated_at
before update on public.user_credits
for each row
execute function public.touch_user_credits_updated_at();

create or replace function public.spend_user_credits(
  p_user_id uuid,
  p_email text,
  p_feature text,
  p_cost integer,
  p_request_id text default null
)
returns table(balance integer, unlimited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_unlimited boolean;
begin
  if p_cost is null or p_cost < 0 then
    raise exception 'invalid credit cost';
  end if;

  insert into public.user_credits(user_id, email, balance)
  values (p_user_id, p_email, 0)
  on conflict (user_id) do update
    set email = coalesce(excluded.email, public.user_credits.email);

  select user_credits.balance, user_credits.is_unlimited
    into v_balance, v_unlimited
  from public.user_credits
  where user_credits.user_id = p_user_id
  for update;

  if v_unlimited then
    insert into public.credit_ledger(user_id, email, feature, amount, balance_after, reason, request_id)
    values (p_user_id, p_email, coalesce(p_feature, 'claude'), 0, v_balance, 'admin-unlimited', p_request_id);
    return query select v_balance, true;
    return;
  end if;

  if v_balance < p_cost then
    raise exception 'tokens-insufficient';
  end if;

  update public.user_credits
    set balance = balance - p_cost
  where user_credits.user_id = p_user_id
  returning user_credits.balance into v_balance;

  insert into public.credit_ledger(user_id, email, feature, amount, balance_after, reason, request_id)
  values (p_user_id, p_email, coalesce(p_feature, 'claude'), -p_cost, v_balance, 'claude-api', p_request_id);

  return query select v_balance, false;
end;
$$;

create or replace function public.grant_user_credits(
  p_user_id uuid,
  p_email text,
  p_amount integer,
  p_reason text default 'manual-grant',
  p_request_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid credit amount';
  end if;

  insert into public.user_credits(user_id, email, balance)
  values (p_user_id, p_email, p_amount)
  on conflict (user_id) do update
    set balance = public.user_credits.balance + excluded.balance,
        email = coalesce(excluded.email, public.user_credits.email)
  returning user_credits.balance into v_balance;

  insert into public.credit_ledger(user_id, email, feature, amount, balance_after, reason, request_id)
  values (p_user_id, p_email, 'credit-grant', p_amount, v_balance, p_reason, p_request_id);

  return v_balance;
end;
$$;
