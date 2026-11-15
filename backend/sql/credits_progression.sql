-- Run once in Supabase SQL Editor before using the updated online server.
-- Keeps legacy totals untouched until a new round finishes. Old points are not credits.
alter table public.matches add column if not exists story_credits jsonb not null default '{}'::jsonb;

-- A room row lock makes round completion and best-result updates atomic.
create or replace function public.finish_credit_round(
  p_room_code text, p_round_id uuid, p_score integer
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.matches%rowtype;
  bests jsonb;
  earned integer;
  previous integer;
  total_credits integer;
  map_key text;
begin
  select * into m from public.matches
    where room_code = upper(p_room_code) for update;
  if not found then raise exception 'Room not found'; end if;
  if m.round_id::text is distinct from p_round_id::text or m.round_status <> 'PLAYING' then return; end if;
  if m.game_mode = 'STORY' then
    if m.current_map not in ('classroom','farm','sports','computer-room','library') then
      raise exception 'Unknown credit map';
    end if;
    earned := least(30, greatest(0, coalesce(p_score, 0)));
    bests := coalesce(m.story_credits, '{}'::jsonb);
    previous := least(30, greatest(0, coalesce((bests->>m.current_map)::integer,0)));
    bests := jsonb_set(bests, array[m.current_map], to_jsonb(greatest(previous,earned)), true);
    total_credits := 0;
    foreach map_key in array array['classroom','farm','sports','computer-room','library'] loop
      total_credits := total_credits + least(30,greatest(0,coalesce((bests->>map_key)::integer,0)));
    end loop;
    update public.matches set
      story_credits = bests,
      story_total = least(120,total_credits),
      round_score = p_score,
      round_status = 'FINISHED'
    where id = m.id;
  else
    update public.matches set round_score = p_score, round_status = 'FINISHED' where id = m.id;
  end if;
end;
$$;
-- Only the authoritative game server may award credits.
revoke all on function public.finish_credit_round(text,uuid,integer) from public, anon, authenticated;
grant execute on function public.finish_credit_round(text,uuid,integer) to service_role;
