-- Run in the Supabase SQL Editor before enabling the Google provider.
begin;

-- The existing registration hook can read a username for Google sign-ups too.
create or replace function public.set_google_player_username() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if nullif(btrim(new.raw_user_meta_data ->> 'username'), '') is null then
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('username', 'chef_' || left(replace(new.id::text, '-', ''), 15));
  end if;
  return new;
end;
$$;

drop trigger if exists set_google_player_username on auth.users;
create trigger set_google_player_username
before insert on auth.users
for each row when (new.raw_app_meta_data ->> 'provider' = 'google')
execute function public.set_google_player_username();

-- Let existing profile hooks finish first, then fill in a missing profile.
create or replace function public.ensure_google_player_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_google_player_profile on auth.users;
create constraint trigger ensure_google_player_profile
after insert on auth.users
deferrable initially deferred
for each row when (new.raw_app_meta_data ->> 'provider' = 'google')
execute function public.ensure_google_player_profile();

revoke all on function public.set_google_player_username() from public, anon, authenticated;
revoke all on function public.ensure_google_player_profile() from public, anon, authenticated;

commit;
