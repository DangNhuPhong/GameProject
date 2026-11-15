import { supabase } from "../config/supabase.js";

export const FREE_CHARACTER_IDS = Object.freeze(["pepper", "mint", "sage"]);

export async function ownsCharacter(userId, characterId) {
  if (FREE_CHARACTER_IDS.includes(characterId)) return true;
  const { data: character, error: catalogError } = await supabase.from("shop_characters")
    .select("price").eq("id", characterId).maybeSingle();
  if (catalogError) throw catalogError;
  if (!character) return false;
  if (character.price === 0) return true;
  const { data, error } = await supabase.from("user_characters")
    .select("character_id").eq("user_id", userId).eq("character_id", characterId).maybeSingle();
  if (error) throw error;
  return !!data;
}

// Old room preferences may predate the shop. Never expose an unowned saved choice.
export async function permittedCharacter(userId, characterId) {
  try { return await ownsCharacter(userId, characterId) ? characterId : "pepper"; }
  catch { return "pepper"; }
}
