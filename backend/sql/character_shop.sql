-- Run in Supabase SQL Editor before opening the shop.
-- Prices are authoritative here; the browser never supplies a price or balance.
begin;
create table if not exists public.shop_characters (
  id text primary key,
  price integer not null check (price >= 0)
);
insert into public.shop_characters (id, price) values
  ('pepper', 0), ('mint', 0), ('sage', 0), ('phong', 500),
  ('faker', 1200), ('ronaldo', 1500), ('trump', 1000), ('kha-banh', 800)
on conflict (id) do nothing;

create table if not exists public.user_characters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  character_id text not null references public.shop_characters(id),
  purchased_at timestamptz not null default now(),
  price_paid integer not null check (price_paid >= 0),
  primary key (user_id, character_id)
);
alter table public.shop_characters enable row level security;
alter table public.user_characters enable row level security;
revoke all on public.shop_characters, public.user_characters from anon, authenticated;

create or replace function public.get_character_shop() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_coins bigint;
  v_characters jsonb;
begin
  if v_user is null then raise exception 'Please log in to open the shop.'; end if;
  select coalesce(coins, 0) into v_coins from public.profiles where id = v_user;
  if not found then raise exception 'Player profile not found.'; end if;
  select jsonb_agg(jsonb_build_object(
    'id', c.id, 'price', c.price,
    'owned', c.price = 0 or exists (
      select 1 from public.user_characters u where u.user_id = v_user and u.character_id = c.id
    )
  ) order by c.price, c.id) into v_characters from public.shop_characters c;
  return jsonb_build_object('coins', v_coins, 'characters', coalesce(v_characters, '[]'::jsonb));
end;
$$;

create or replace function public.buy_shop_character(p_character_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_coins bigint;
  v_price integer;
begin
  if v_user is null then raise exception 'Please log in to buy characters.'; end if;
  -- Serialize purchases for this account, including requests from different tabs.
  select coalesce(coins, 0) into v_coins from public.profiles where id = v_user for update;
  if not found then raise exception 'Player profile not found.'; end if;
  select price into v_price from public.shop_characters where id = p_character_id for share;
  if not found then raise exception 'Character not found.'; end if;
  if v_price = 0 or exists (
    select 1 from public.user_characters where user_id = v_user and character_id = p_character_id
  ) then
    return public.get_character_shop();
  end if;
  if v_coins < v_price then raise exception 'Not enough coins to buy this character.'; end if;
  insert into public.user_characters (user_id, character_id, price_paid)
    values (v_user, p_character_id, v_price);
  update public.profiles set coins = v_coins - v_price where id = v_user;
  return public.get_character_shop();
end;
$$;
revoke all on function public.get_character_shop() from public, anon;
revoke all on function public.buy_shop_character(text) from public, anon;
grant execute on function public.get_character_shop() to authenticated;
grant execute on function public.buy_shop_character(text) to authenticated;
commit;
