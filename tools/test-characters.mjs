import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCharacterStore, CHARACTER_IDS } from "../backend/src/classes/characterStore.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitchen-characters-"));
try {
  const filename = path.join(dir, "characters.json");
  const store = createCharacterStore(filename);
  assert.equal(store.get("room1", "alice"), "pepper");
  store.set("room1", "alice", "mint");
  store.set("room1", "bob", "sage");
  store.set("room2", "alice", "pepper");
  assert.equal(store.get("room1", "alice"), "mint");
  assert.equal(store.get("room1", "bob"), "sage");
  assert.equal(store.get("room2", "alice"), "pepper");
  assert.equal(createCharacterStore(filename).get("room1", "bob"), "sage", "Restart retains choices");
  assert.throws(() => store.set("room1", "alice", "fake"), /Invalid/);

  // Execute the real HTTP handler with fake auth/database and broadcast boundaries.
  const source = fs.readFileSync(new URL("../backend/src/controllers/matchController.js", import.meta.url), "utf8");
  const handlerSource = source.slice(source.indexOf("export async function selectCharacter"), source.indexOf("export const createMatch"));
  let auth = true, member = true, status = "WAITING";
  const broadcasts = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: auth ? { id: "alice" } : null }, error: null }) },
    from(table) {
      const query = { select() { return query; }, eq() { return query; }, is() { return query; },
        async maybeSingle() { return { data: table === "matches" ? { id: "room1", status, room_code: "ROOM" } : member ? { id: "member" } : null }; } };
      return query;
    },
  };
  const handler = new Function("supabase", "characterStore", "CHARACTER_IDS", `${handlerSource.replace("export ", "")}\nreturn selectCharacter;`)(supabase, store, CHARACTER_IDS);
  async function request(id) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    await handler({ headers: { authorization: "Bearer valid" }, body: { characterId: id }, params: { roomCode: "room" },
      app: { get: () => ({ to: (room) => ({ emit: (event, data) => broadcasts.push({ room, event, data }) }) }) } }, res);
    return res;
  }
  assert.equal((await request("sage")).statusCode, 200);
  assert.equal(store.get("room1", "alice"), "sage");
  assert.deepEqual(broadcasts[0], { room: "ROOM", event: "character-selected", data: { userId: "alice", characterId: "sage" } });
  assert.equal((await request("fake")).statusCode, 400);
  auth = false; assert.equal((await request("mint")).statusCode, 401); auth = true;
  member = false; assert.equal((await request("mint")).statusCode, 403); member = true;
  status = "PLAYING"; assert.equal((await request("mint")).statusCode, 409);
  assert.equal(store.get("room1", "alice"), "sage", "Rejected changes keep the previous choice");
  assert.equal(broadcasts.length, 1, "Only successful changes broadcast");

  // Exercise the actual remote-player renderer with multiple character IDs.
  const scene = fs.readFileSync(new URL("../frontend/src/game/KitchenScene.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = scene.indexOf("    updateOtherPlayer(");
  const end = scene.indexOf("    // =====================================", start);
  const getCharacter = (id) => ({ spriteKey: `chef-${CHARACTER_IDS.includes(id) ? id : "pepper"}` });
  const Methods = new Function("getCharacter", `const CHEF_FOOT_OFFSET=9,CHEF_SCALE=.1875;const chefFacing=()=>"side";return class {${scene.slice(start, end)}}`)(getCharacter);
  const remote = new Methods();
  remote.otherPlayers = {};
  const visual = () => ({ setTint() { return this; }, setAlpha() { return this; }, setDepth() { return this; }, setOrigin() { return this; }, setScale() { return this; }, setFlipX() {} });
  remote.add = { image: visual, sprite: (x, y, key) => ({ ...visual(), key }) };
  remote.updateOtherPlayer("alice", 20, 30, Date.now(), "mint");
  remote.updateOtherPlayer("bob", 40, 50, Date.now(), "sage");
  assert.equal(remote.otherPlayers.alice.player.key, "chef-mint");
  assert.equal(remote.otherPlayers.bob.player.key, "chef-sage");
  remote.updateOtherPlayer("alice", 20, 30, Date.now(), "sage");
  assert.equal(remote.otherPlayers.alice.spriteKey, "chef-sage", "Reconnect updates animation identity");
  assert.equal(Object.keys(remote.otherPlayers).length, 2);
  // Run the real browser storage helpers without importing PNG files in Node.
  const characterSource = fs.readFileSync(new URL("../frontend/src/game/characters.js", import.meta.url), "utf8")
    .replace(/^import (\w+) from .+;$/gm, 'const $1 = "asset";').replace(/export /g, "");
  const storage = () => {
    const entries = new Map();
    return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  };
  const local = storage(), session = storage();
  const loadHelpers = () => new Function("localStorage", "sessionStorage", `${characterSource}; return { readStoryCharacters, confirmStoryCharacters, saveCharacter };`)(local, session);
  const helpers = loadHelpers();
  assert.equal(helpers.readStoryCharacters("single"), null, "New story must choose before maps");
  session.setItem("kitchen-story:coop-local", JSON.stringify({ total: 100, completed: ["round1"] }));
  helpers.confirmStoryCharacters("coop-local", { p1: "sage", p2: "mint" });
  assert.deepEqual(helpers.readStoryCharacters("coop-local"), { p1: "sage", p2: "mint" });
  assert.equal(JSON.parse(session.getItem("kitchen-story:coop-local")).total, 100, "Confirming preserves progress");
  helpers.saveCharacter("p1", "pepper");
  assert.deepEqual(loadHelpers().readStoryCharacters("coop-local"), { p1: "sage", p2: "mint" }, "Reload keeps story identities despite preference changes");
  assert.deepEqual(helpers.confirmStoryCharacters("coop-local", { p1: "pepper", p2: "sage" }), { p1: "sage", p2: "mint" }, "Confirmed story lineup cannot change between maps");
  const progress = JSON.parse(session.getItem("kitchen-story:coop-local"));
  progress.total += 200; progress.completed.push("round2");
  session.setItem("kitchen-story:coop-local", JSON.stringify(progress));
  assert.deepEqual(helpers.readStoryCharacters("coop-local"), { p1: "sage", p2: "mint" }, "Round results preserve characters");
  assert.equal(helpers.readStoryCharacters("single"), null, "Modes have independent story lineups");
  session.removeItem("kitchen-story:coop-local");
  assert.equal(helpers.readStoryCharacters("coop-local"), null, "Starting a new story unlocks selection");
  helpers.confirmStoryCharacters("single", { p1: "mint", p2: "sage" });
  assert.deepEqual(helpers.readStoryCharacters("single"), { p1: "mint" });
  console.log("Passed character persistence, room isolation, validation/auth, lobby broadcast and remote rendering checks.");
  console.log("Passed offline story selection, fixed P1/P2 identity, reload, progress and new-story reset checks.");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
