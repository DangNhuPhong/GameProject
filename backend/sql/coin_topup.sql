-- DEMO ONLY: this intentionally grants test coins without receiving money.
-- Run character_shop.sql first, then run this file in Supabase SQL Editor.
begin;
create table if not exists public.coin_topup_settings (
  id boolean primary key default true check (id),
  demo_enabled boolean not null default false
);
-- Explicitly enables demo mode for this student project. Never use this as real payment verification.
insert into public.coin_topup_settings (id, demo_enabled) values (true, true) on conflict (id) do nothing;
create table if not exists public.coin_packages (
  id text primary key,
  coins integer not null check (coins > 0),
  amount_vnd integer not null check (amount_vnd > 0)
);
insert into public.coin_packages (id, coins, amount_vnd) values
  ('small', 100, 10000), ('medium', 220, 20000),
  ('large', 600, 50000), ('mega', 1300, 100000)
on conflict (id) do nothing;
create table if not exists public.coin_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  package_id text not null references public.coin_packages(id),
  coins integer not null check (coins > 0),
  amount_vnd integer not null check (amount_vnd > 0),
  payment_mode text not null default 'DEMO' check (payment_mode = 'DEMO'),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists coin_topups_user_created on public.coin_topups (user_id, created_at desc);
alter table public.coin_topup_settings enable row level security;
alter table public.coin_packages enable row level security;
alter table public.coin_topups enable row level security;
revoke all on public.coin_topup_settings, public.coin_packages, public.coin_topups from anon, authenticated;

create or replace function public.get_coin_topup_info() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Please log in to top up coins.'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select demo_enabled from public.coin_topup_settings where id = true), false),
    'packages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'coins', coins, 'amount_vnd', amount_vnd
    ) order by coins) from public.coin_packages), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (
      select id, coins, amount_vnd, created_at, payment_mode
      from public.coin_topups where user_id = v_user order by created_at desc, id limit 5
    ) h), '[]'::jsonb)
  );
end;
$$;

create or replace function public.demo_coin_topup(p_package_id text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_balance bigint;
  v_pack public.coin_packages%rowtype;
  v_existing public.coin_topups%rowtype;
begin
  if v_user is null then raise exception 'Please log in to top up coins.'; end if;
  if p_request_id is null then raise exception 'A request ID is required.'; end if;
  -- Share the purchase lock: concurrent top-ups and purchases cannot lose balance updates.
  select coalesce(coins, 0) into v_balance from public.profiles where id = v_user for update;
  if not found then raise exception 'Player profile not found.'; end if;
  select * into v_existing from public.coin_topups where user_id = v_user and request_id = p_request_id;
  if found then
    if v_existing.package_id <> p_package_id then raise exception 'Request ID already used for another package.'; end if;
  else
    if not coalesce((select demo_enabled from public.coin_topup_settings where id = true for share), false) then
      raise exception 'Demo top-ups are disabled.';
    end if;
    select * into v_pack from public.coin_packages where id = p_package_id for share;
    if not found then raise exception 'Coin package not found.'; end if;
    if v_balance + v_pack.coins > 2147483647 then raise exception 'Coin balance limit reached.'; end if;
    insert into public.coin_topups (user_id, request_id, package_id, coins, amount_vnd)
      values (v_user, p_request_id, v_pack.id, v_pack.coins, v_pack.amount_vnd);
    update public.profiles set coins = v_balance + v_pack.coins where id = v_user;
  end if;
  return jsonb_build_object('shop', public.get_character_shop(), 'topups', public.get_coin_topup_info());
end;
$$;
revoke all on function public.get_coin_topup_info() from public, anon;
revoke all on function public.demo_coin_topup(text, uuid) from public, anon;
grant execute on function public.get_coin_topup_info() to authenticated;
grant execute on function public.demo_coin_topup(text, uuid) to authenticated;
commit;

-- To disable test coin grants later:
-- update public.coin_topup_settings set demo_enabled = false where id = true;
