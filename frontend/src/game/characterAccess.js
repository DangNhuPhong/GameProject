export const FREE_CHARACTER_IDS = Object.freeze(["pepper", "mint", "sage"]);

export function isLineupOwned(lineup, ownedIds, mode) {
  const slots = mode === "coop-local" ? ["p1", "p2"] : ["p1"];
  return !!lineup && slots.every((slot) => ownedIds.includes(lineup[slot]));
}

export function allowedCharacter(id, ownedIds, fallback = "pepper") {
  return ownedIds.includes(id) ? id : fallback;
}

// Returning from a round must not look like starting a new story while access loads.
export function resolveStoryLineup(stored, access, mode) {
  if(!stored)return {characters:null,verified:false,needsSelection:true,error:''};
  const customError=Object.values(stored).some(id=>id.startsWith('custom:'))?access.customError:'';
  const error=access.error||customError||'';
  if(access.loading||error)return {characters:stored,verified:false,needsSelection:false,error};
  if(isLineupOwned(stored,access.ids,mode))return {characters:stored,verified:true,needsSelection:false,error:''};
  return {characters:null,verified:false,needsSelection:true,error:''};
}
