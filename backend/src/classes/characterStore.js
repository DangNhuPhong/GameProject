import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CHARACTER_IDS = Object.freeze(["pepper", "mint", "sage", "phong", "faker", "ronaldo"]);
export const normalizeCharacter = (id) => CHARACTER_IDS.includes(id) ? id : "pepper";

// Separate from rounds so returning to the lobby and reconnecting keep the choice.
export function createCharacterStore(filename) {
  let choices = {};
  if (fs.existsSync(filename)) choices = JSON.parse(fs.readFileSync(filename, "utf8"));
  return {
    get(matchId, userId) { return normalizeCharacter(choices[matchId]?.[userId]); },
    set(matchId, userId, characterId) {
      if (!CHARACTER_IDS.includes(characterId)) throw new Error("Invalid character");
      const next = { ...choices, [matchId]: { ...choices[matchId], [userId]: characterId } };
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(`${filename}.tmp`, JSON.stringify(next));
      fs.renameSync(`${filename}.tmp`, filename);
      choices = next;
    },
  };
}

const filename = process.env.CHARACTER_STORE_PATH || fileURLToPath(new URL("../../data/characters.json", import.meta.url));
export const characterStore = createCharacterStore(filename);
