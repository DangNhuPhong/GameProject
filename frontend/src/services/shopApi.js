import { supabase } from "../lib/supabase";

async function shopRequest(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (["PGRST202", "42P01"].includes(error.code)) {
      throw new Error(name.includes("topup")
        ? "Top-up is not set up yet. Run backend/sql/coin_topup.sql in Supabase SQL Editor."
        : "Shop is not set up yet. Run backend/sql/character_shop.sql in Supabase SQL Editor.");
    }
    throw new Error(error.message || "Unable to load the shop. Please try again.");
  }
  return data;
}

export const getShop = () => shopRequest("get_character_shop");
export const buyCharacter = (id) =>
  shopRequest("buy_shop_character", { p_character_id: id });

export const getCoinTopups = () => shopRequest("get_coin_topup_info");
export const topUpDemoCoins = (packageId, requestId) =>
  shopRequest("demo_coin_topup", { p_package_id: packageId, p_request_id: requestId });
