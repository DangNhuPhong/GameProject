import { API_URL } from "./config";
import { supabase } from "../lib/supabase";

async function call(path, method = "GET", body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in");
  const res = await fetch(`${API_URL}/api/matches/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data.data;
}
export const updateRoomMode = (code, userId, gameMode, mapId) =>
  call(`${code}/mode`, "PATCH", { gameMode, mapId });
export const startStoryRound = (code, mapId) =>
  call(`${code}/story/start`, "POST", { mapId });

export const quitRound = (code) => call(`${code}/quit`, "POST");

export const returnRoomToLobby = (code) => call(`${code}/quit`, "POST", { destination: "lobby" });
