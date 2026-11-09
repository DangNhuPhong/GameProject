import pepper from "../assets/characters/pepper.png";
import mint from "../assets/characters/mint.png";
import sage from "../assets/characters/sage.png";
import pepperPortrait from "../assets/characters/pepper-portrait.png";
import mintPortrait from "../assets/characters/mint-portrait.png";
import sagePortrait from "../assets/characters/sage-portrait.png";
import phong from "../assets/characters/phong.png";
import phongPortrait from "../assets/characters/phong-portrait.png";
import faker from "../assets/characters/faker.png";
import fakerPortrait from "../assets/characters/faker-portrait.png";
import ronaldo from "../assets/characters/ronaldo.png";
import ronaldoPortrait from "../assets/characters/ronaldo-portrait.png";

export const CHARACTERS = [
  {
    id: "pepper",
    name: "Pepper",
    description: "Đầu bếp năng động",
    sheet: pepper,
    portrait: pepperPortrait,
    spriteKey: "chef-pepper",
    color: "#f47b68",
  },
  {
    id: "mint",
    name: "Mint",
    description: "Cô nàng khéo tay",
    sheet: mint,
    portrait: mintPortrait,
    spriteKey: "chef-mint",
    color: "#51c6ae",
  },
  {
    id: "sage",
    name: "Sage",
    description: "Bếp trưởng kỳ cựu",
    sheet: sage,
    portrait: sagePortrait,
    spriteKey: "chef-sage",
    color: "#b4a0ed",
  },
  {
    id: "phong",
    name: "Phong",
    description: "UIT Student",
    sheet: phong,
    portrait: phongPortrait,
    spriteKey: "chef-phong",
    color: "#36c8de",
  },
  {
    id: "faker",
    name: "Faker",
    description: "4th World 2026",
    sheet: faker,
    portrait: fakerPortrait,
    spriteKey: "chef-faker",
    color: "#ed2636",
  },
  {
    id: "ronaldo",
    name: "Ronaldo",
    description: "GOAT",
    sheet: ronaldo,
    portrait: ronaldoPortrait,
    spriteKey: "chef-ronaldo",
    color: "#d5ad54",
  },
];
export const getCharacter = (id) =>
  CHARACTERS.find((character) => character.id === id) || CHARACTERS[0];
export function readCharacter(slot = "p1") {
  try {
    return getCharacter(
      localStorage.getItem(`kitchen-character:${slot}`) ||
        (slot === "p2" ? "mint" : "pepper"),
    ).id;
  } catch {
    return slot === "p2" ? "mint" : "pepper";
  }
}
export function saveCharacter(slot, id) {
  try {
    localStorage.setItem(`kitchen-character:${slot}`, getCharacter(id).id);
  } catch {
    /* Storage is optional. */
  }
}

// A story owns its lineup: browser preferences only seed a new story's picker.
export function readStoryCharacters(mode) {
  try {
    const { characters } = JSON.parse(
      sessionStorage.getItem(`kitchen-story:${mode}`) || "{}",
    );
    const slots = mode === "coop-local" ? ["p1", "p2"] : ["p1"];
    if (
      !characters ||
      slots.some(
        (slot) =>
          !CHARACTERS.some((character) => character.id === characters[slot]),
      )
    )
      return null;
    return Object.fromEntries(slots.map((slot) => [slot, characters[slot]]));
  } catch {
    return null;
  }
}

export function confirmStoryCharacters(mode, selections) {
  const key = `kitchen-story:${mode}`;
  const progress = JSON.parse(
    sessionStorage.getItem(key) || '{"total":0,"completed":[]}',
  );
  // Once confirmed, returning from a round keeps the same players and characters.
  const existing = readStoryCharacters(mode);
  if (existing) return existing;
  const slots = mode === "coop-local" ? ["p1", "p2"] : ["p1"];
  const characters = Object.fromEntries(
    slots.map((slot) => [slot, getCharacter(selections[slot]).id]),
  );
  sessionStorage.setItem(key, JSON.stringify({ ...progress, characters }));
  slots.forEach((slot) => saveCharacter(slot, characters[slot]));
  return characters;
}
