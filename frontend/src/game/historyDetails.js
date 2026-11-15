import { getStoryMap, summarizeCredits } from "./storyConfig.js";

export function historyCredits(room) {
  if (room.game_mode === "STORY") {
    if (!room.story_credits || typeof room.story_credits !== "object") return null;
    return { value: summarizeCredits(room.story_credits).total, label: "Shared story credits", cap: 120 };
  }
  if (room.game_mode === "FREE" && room.round_status === "FINISHED" && room.round_score != null && Number.isFinite(Number(room.round_score))) {
    return { value: Number(room.round_score), label: "Last finished round credits", cap: null };
  }
  return null;
}

export const historyMapName = (id) => getStoryMap(id)?.name || (id === "kitchen" ? "Kitchen" : id || "Not selected");

export function historyRoomStatus(room) {
  if (room.ended_at || ["FINISHED", "COMPLETED", "ENDED"].includes(room.status)) return "Ended";
  if (room.round_status === "PLAYING") return "Round in progress";
  if (room.round_status === "FINISHED") return "Round finished";
  if (room.status === "WAITING") return "Waiting in lobby";
  return room.status === "PLAYING" ? "Between rounds" : room.status || "Unknown";
}
