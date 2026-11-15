# Online play history

Run `backend/sql/online_play_history.sql` in Supabase SQL Editor, then open **History** beside **Shop** on the landing page. No backend deployment is required for this feature. The frontend calls the authenticated Supabase RPC.

The query reads existing `matches`, `match_players` and `profiles`. A room appears when the signed-in user is its host or has a membership record, including memberships with `left_at` set. Hosts still see their room if their membership row is missing. Repeated membership records produce one room and one entry per member. Each page contains at most 20 rooms ordered by first joined date (creation date for hosts without a membership), with a next-page button. Guests must log in. The SQL function derives the user from `auth.uid()` and cannot query another player's private room list using a client-supplied user ID. Only display names and room-related fields are returned.

Story credits are the shared room's best-map total, capped at 120 using the same rules as the game. Legacy points are not relabeled as credits. Free Play shows only the latest finished round's actual credits, including negative values. Rooms without a stored credit result say no finished credits recorded. The status is the last saved database status; it does not indicate whether anyone is currently connected.

This is room history, not a per-round archive. Records show the current stored room state, so totals can change after further play. The roster contains everyone who joined the room, potentially across different rounds; it does not assert that all members played simultaneously. Deleted rooms/membership records cannot be reconstructed. Offline single/local play is not stored in these tables and is not included.

Validation completed locally: production build; component/service lint; `node tools/test-play-history.mjs`. Live Supabase SQL and browser interactions still require validation after applying the migration:

1. Sign in as a host and check an existing room, member names, dates and shared credits.
2. Sign in as a participant and check the same room is marked Joined by you.
3. Verify rooms belonging only to other users are absent; unauthenticated RPC calls must fail.
4. Check a room still appears after leaving if the membership is retained, and duplicate membership rows do not duplicate players/rooms.
5. Check empty history, paging past 20 rooms, refresh, error/retry, Escape, focus restoration and a narrow phone layout.
