import assert from "node:assert/strict";
import fs from "node:fs";
import { historyCredits, historyMapName, historyRoomStatus } from "../frontend/src/game/historyDetails.js";

const story = { game_mode: "STORY", story_credits: { classroom: 24, farm: 22 }, story_total: 9000 };
assert.deepEqual(historyCredits(story), { value: 46, label: "Shared story credits", cap: 120 });
assert.equal(historyCredits({ game_mode: "STORY", story_total: 9000 }), null, "Legacy points cannot be presented as credits");
assert.equal(historyCredits({ ...story, story_credits: { classroom: 99, farm: -3 } }).value, 30);
assert.equal(historyCredits({ ...story, story_credits: { classroom: 30, farm: 30, sports: 30, "computer-room": 30, library: 30 } }).value, 120);
assert.equal(historyCredits({ game_mode: "FREE", round_status: "PLAYING", round_score: 42 }), null);
assert.equal(historyCredits({ game_mode: "FREE", round_status: "FINISHED", round_score: -3 }).value, -3, "Free-play credits keep actual deductions");
assert.equal(historyCredits({ game_mode: "FREE", round_status: "FINISHED", round_score: null }), null);
assert.equal(historyRoomStatus({ status: "WAITING", round_status: "IDLE" }), "Waiting in lobby");
assert.equal(historyRoomStatus({ status: "PLAYING", round_status: "FINISHED" }), "Round finished");
assert.equal(historyRoomStatus({ ended_at: "2026-11-15", status: "PLAYING" }), "Ended");
assert.equal(historyMapName("computer-room"), "Computer Room");

// Run the actual RPC wrapper without needing a live Supabase account.
const source = fs.readFileSync(new URL("../frontend/src/services/historyApi.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
let response = { data: { rooms: [{ id: "room-one" }], has_more: true }, error: null };
let called;
const getHistory = new Function("supabase", `${source}; return getOnlinePlayHistory;`)({
  rpc: async (name, args) => { called = { name, args }; return response; },
});
assert.deepEqual(await getHistory(20), response.data);
assert.deepEqual(called, { name: "get_online_play_history", args: { p_limit: 20, p_offset: 20 } });
response = { data: null, error: { code: "PGRST202" } };
await assert.rejects(() => getHistory(), /online_play_history.sql/);
response = { data: null, error: { message: "Please sign in" } };
await assert.rejects(() => getHistory(), /Please sign in/);
console.log("PASS: history credit semantics, legacy data, statuses, pagination and RPC errors");
