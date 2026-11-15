export const FREE_CHARACTER_IDS = Object.freeze(["pepper", "mint", "sage"]);

export function isLineupOwned(lineup, ownedIds, mode) {
  const slots = mode === "coop-local" ? ["p1", "p2"] : ["p1"];
  return !!lineup && slots.every((slot) => ownedIds.includes(lineup[slot]));
}

export function allowedCharacter(id, ownedIds, fallback = "pepper") {
  return ownedIds.includes(id) ? id : fallback;
}
