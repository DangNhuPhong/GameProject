-- Run after character_shop.sql. Only the backend service role can spend/refund coins.
begin;
create table if not exists public.custom_characters (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version uuid not null,
  sheet_path text not null,
  portrait_path text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.character_generation_jobs (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cost integer not null check (cost > 0),
  status text not null check (status in ('processing','completed','failed')),
  message text,
  cleanup_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists one_character_generation_per_user
  on public.character_generation_jobs(user_id) where status = 'processing';
alter table public.custom_characters enable row level security;
alter table public.character_generation_jobs enable row level security;
revoke all on public.custom_characters, public.character_generation_jobs from anon, authenticated;
grant all on public.custom_characters, public.character_generation_jobs to service_role;

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

create or replace function public.fail_character_generation(p_job uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_cost integer;
begin
  select user_id into v_user from public.character_generation_jobs where id=p_job;
  if v_user is null then return; end if;
  perform 1 from public.profiles where id=v_user for update;
  update public.character_generation_jobs set status='failed', message=left(p_message,300),finished_at=now()
    where id=p_job and status='processing' returning cost into v_cost;
  if found then update public.profiles set coins=coalesce(coins,0)+v_cost where id=v_user; end if;
end; $$;

create or replace function public.finish_character_generation(p_job uuid, p_sheet text, p_portrait text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_old public.custom_characters; v_status text;
begin
  select user_id into v_user from public.character_generation_jobs where id=p_job;
  if v_user is null then raise exception 'Job not found'; end if;
  perform 1 from public.profiles where id=v_user for update;
  select status into v_status from public.character_generation_jobs where id=p_job for update;
  if v_status='completed' then return; end if;
  if v_status <> 'processing' then raise exception 'Job has expired'; end if;
  select * into v_old from public.custom_characters where user_id=v_user;
  insert into public.custom_characters(user_id,version,sheet_path,portrait_path)
    values(v_user,p_job,p_sheet,p_portrait)
    on conflict(user_id) do update set version=excluded.version,sheet_path=excluded.sheet_path,
      portrait_path=excluded.portrait_path,updated_at=now();
  update public.character_generation_jobs set status='completed',finished_at=now(),
    cleanup_paths=case when v_old.user_id is null then '{}'::text[] else array[v_old.sheet_path,v_old.portrait_path] end
    where id=p_job;
end; $$;

revoke all on function public.begin_character_generation(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.fail_character_generation(uuid,text) from public,anon,authenticated;
revoke all on function public.finish_character_generation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_character_generation(uuid,uuid,integer) to service_role;
grant execute on function public.fail_character_generation(uuid,text) to service_role;
grant execute on function public.finish_character_generation(uuid,text,text) to service_role;

-- Public read is needed for teammates' textures; upload/delete remain service-role only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('custom-characters','custom-characters',true,2097152,array['image/png'])
on conflict(id) do nothing;
commit;
