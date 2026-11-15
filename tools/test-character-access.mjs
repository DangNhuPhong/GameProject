import assert from "node:assert/strict";
import fs from "node:fs";
import { FREE_CHARACTER_IDS, isLineupOwned, allowedCharacter } from "../frontend/src/game/characterAccess.js";

assert.equal(isLineupOwned({ p1: "faker" }, FREE_CHARACTER_IDS, "single"), false);
assert.equal(isLineupOwned({ p1: "pepper", p2: "faker" }, FREE_CHARACTER_IDS, "coop-local"), false);
assert.equal(isLineupOwned({ p1: "pepper", p2: "mint" }, FREE_CHARACTER_IDS, "coop-local"), true);
assert.equal(isLineupOwned({ p1: "faker" }, [...FREE_CHARACTER_IDS, "faker"], "single"), true);
assert.equal(allowedCharacter("faker", FREE_CHARACTER_IDS), "pepper");
assert.equal(allowedCharacter("faker", FREE_CHARACTER_IDS, "mint"), "mint");

let owns = false, fail = false, queries = 0;
const database = { from(table) {
  queries++;
  const q = { select() { return q; }, eq() { return q; }, async maybeSingle() {
    if (fail) return { data: null, error: new Error("DB offline") };
    return { data: table === "shop_characters" ? { price: 1200 } : owns ? { character_id: "faker" } : null, error: null };
  } };
  return q;
} };
const source = fs.readFileSync(new URL("../backend/src/services/characterAccess.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
const { ownsCharacter, permittedCharacter } = new Function("supabase", `${source}; return { ownsCharacter, permittedCharacter };`)(database);
assert.equal(await ownsCharacter("alice", "pepper"), true);
assert.equal(queries, 0, "Free chefs work even without shop setup");
assert.equal(await ownsCharacter("alice", "faker"), false);
assert.equal(await permittedCharacter("alice", "faker"), "pepper", "Old saved paid choices cannot bypass ownership");
owns = true;
assert.equal(await ownsCharacter("alice", "faker"), true);
assert.equal(await permittedCharacter("alice", "faker"), "faker");
fail = true;
await assert.rejects(() => ownsCharacter("alice", "faker"));
assert.equal(await permittedCharacter("alice", "faker"), "pepper", "DB failures fail closed");

const characterSource = fs.readFileSync(new URL("../frontend/src/game/characters.js", import.meta.url), "utf8")
  .replace(/^import (\w+) from .+;$/gm, 'const $1 = "asset";').replace(/export /g, "");
const entries = new Map();
const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
const helpers = new Function("localStorage", "sessionStorage", `${characterSource}; return { confirmStoryCharacters };`)(storage, storage);
storage.setItem("kitchen-story:single", JSON.stringify({ total: 42, completed: ["round1"], characters: { p1: "faker" } }));
assert.deepEqual(helpers.confirmStoryCharacters("single", { p1: "pepper" }, FREE_CHARACTER_IDS), { p1: "pepper" });
assert.equal(JSON.parse(storage.getItem("kitchen-story:single")).total, 42, "Replacing locked legacy choices preserves progress");
assert.throws(() => helpers.confirmStoryCharacters("coop-local", { p1: "pepper", p2: "faker" }, FREE_CHARACTER_IDS), /Buy this character/);
console.log("Character ownership checks passed.");
