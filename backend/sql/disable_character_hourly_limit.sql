-- Testing only: run in Supabase SQL Editor to update an existing installation.
-- Keeps coin reservation, ownership and the one-active-job guard intact.
begin;
create or replace function public.begin_character_generation(p_user uuid, p_job uuid, p_cost integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_balance bigint;
begin
  if p_cost <= 0 then raise exception 'Invalid price'; end if;
  select coalesce(coins,0) into v_balance from public.profiles where id=p_user for update;
  if not found then raise exception 'Player profile not found'; end if;
  if exists(select 1 from public.character_generation_jobs where user_id=p_user and status='processing') then
    raise exception 'A character is already being generated';
  end if;
  -- Hourly attempt limit temporarily disabled for testing.
  if v_balance < p_cost then raise exception 'Not enough coins'; end if;
  update public.profiles set coins=v_balance-p_cost where id=p_user;
  insert into public.character_generation_jobs(id,user_id,cost,status) values(p_job,p_user,p_cost,'processing');
end; $$;
revoke all on function public.begin_character_generation(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.begin_character_generation(uuid,uuid,integer) to service_role;
commit;
