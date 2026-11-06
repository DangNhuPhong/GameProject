import GameController from "./GameController.js";
import { getMapLayout } from "../maps/index.js";
import { supabase } from "../config/supabase.js";

export const controller = new GameController({
  getLayout: getMapLayout,
  onRoundFinished: async ({ roomCode, roundId, score }) => {
    if (!roundId) return;
    const { error } = await supabase.rpc("finish_story_round", {
      p_room_code: roomCode, p_round_id: roundId, p_score: score,
    });
    if (error) throw error;
  },
});
