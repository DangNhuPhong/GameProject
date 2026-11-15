-- Run in Supabase SQL Editor. Reads existing online matches and membership records.
-- Does not change existing data or require a backend deployment.
begin;
create index if not exists match_players_history_user_match
  on public.match_players (user_id, match_id);
create index if not exists matches_history_host_created
  on public.matches (host_id, created_at desc);

create or replace function public.get_online_play_history(
  p_limit integer default 20, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 20)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_result jsonb;
begin
  if v_user is null then raise exception 'Please sign in to view online history.'; end if;
  with recent as (
    select m.*, coalesce(membership.joined_at, m.created_at) as visited_at,
      membership.joined_at as my_joined_at
    from public.matches m
    left join lateral (
      select min(mp.joined_at) as joined_at, count(*) as membership_count
      from public.match_players mp where mp.match_id = m.id and mp.user_id = v_user
    ) membership on true
    where m.host_id = v_user or membership.membership_count > 0
    order by visited_at desc nulls last, m.id desc
    limit v_limit + 1 offset v_offset
  ), page as (
    select * from recent order by visited_at desc nulls last, id desc limit v_limit
  ), room_data as (
    select p.visited_at, p.id, jsonb_build_object(
      'id', p.id,
      'room_code', p.room_code,
      'role', case when p.host_id = v_user then 'HOST' else 'JOINED' end,
      'host_id', p.host_id,
      'host_name', coalesce(nullif(host.username, ''), 'Unknown player'),
      'created_at', p.created_at,
      'joined_at', p.my_joined_at,
      'visited_at', p.visited_at,
      'started_at', to_jsonb(p)->'started_at',
      'ended_at', to_jsonb(p)->'ended_at',
      'status', p.status,
      'game_mode', to_jsonb(p)->'game_mode',
      'current_map', coalesce(to_jsonb(p)->>'current_map', to_jsonb(p)->>'map'),
      'round_status', to_jsonb(p)->'round_status',
      'round_score', to_jsonb(p)->'round_score',
      'story_credits', to_jsonb(p)->'story_credits',
      'players', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', members.user_id,
          'username', coalesce(nullif(profile.username, ''), 'Unknown player'),
          'is_host', members.user_id = p.host_id,
          'is_you', members.user_id = v_user
        ) order by (members.user_id = p.host_id) desc, profile.username nulls last, members.user_id)
        from (
          select mp.user_id from public.match_players mp where mp.match_id = p.id
          union select p.host_id where p.host_id is not null
        ) members
        left join public.profiles profile on profile.id = members.user_id
      ), '[]'::jsonb)
    ) as room
    from page p left join public.profiles host on host.id = p.host_id
  )
  select jsonb_build_object(
    'rooms', coalesce((select jsonb_agg(room order by visited_at desc nulls last, id desc) from room_data), '[]'::jsonb),
    'has_more', (select count(*) > v_limit from recent)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_online_play_history(integer, integer) from public, anon;
grant execute on function public.get_online_play_history(integer, integer) to authenticated;
commit;
