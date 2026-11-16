import { supabase } from "../lib/supabase";

export async function getOnlinePlayHistory(offset = 0) {
  const { data, error } = await supabase.rpc("get_online_play_history", {
    p_limit: 20, p_offset: offset,
  });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("History is not set up yet. Run backend/sql/online_play_history.sql in Supabase SQL Editor.");
    }
    throw new Error(error.message || "Could not load online history. Please try again.");
  }
  return data;
}
