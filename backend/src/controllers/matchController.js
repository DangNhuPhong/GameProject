import { controller } from "../classes/gameRuntime.js";
import { canPlayStoryMap } from "../classes/storyConfig.js";
import { supabase } from "../config/supabase.js";

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
};

export const createMatch = async (req, res) => {
  try {
    const { user_id, max_players = 4, map = "Kitchen_1" } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }

    if (max_players < 1 || max_players > 4) {
      return res.status(400).json({
        success: false,
        message: "max_players must be between 1 and 4",
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .maybeSingle();

    if (profileError || !profile) {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });

      return res.status(404).json({
        success: false,
        message: "User profile not found",
        debug: {
          user_id,
          found: Boolean(profile),
          profileError,
          totalProfilesVisibleToServer: count,
          supabaseHost: new URL(process.env.SUPABASE_URL).host,
        },
      });
    }

    let roomCode;
    let exists = true;

    while (exists) {
      roomCode = generateRoomCode();

      const { data: existingRoom } = await supabase
        .from("matches")
        .select("id")
        .eq("room_code", roomCode)
        .maybeSingle();

      exists = !!existingRoom;
    }

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert({
        room_code: roomCode,
        host_id: user_id,
        status: "WAITING",
        map,
        max_players,
        game_mode: "STORY",
        current_map: "classroom",
        story_total: 0,
        round_status: "IDLE",
      })
      .select()
      .single();

    if (matchError) {
      console.error(matchError);

      return res.status(500).json({
        success: false,
        message: matchError.message,
      });
    }

    const { error: playerError } = await supabase.from("match_players").insert({
      match_id: match.id,
      user_id,
      ready: false,
    });

    if (playerError) {
      console.error(playerError);

      await supabase.from("matches").delete().eq("id", match.id);

      return res.status(500).json({
        success: false,
        message: playerError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Room created successfully",
      data: match,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getMatchByRoomCode = async (req, res) => {
  try {
    const roomCode = req.params.roomCode.trim().toUpperCase();

    const { data: match, error } = await supabase
      .from("matches")
      .select(
        `
          *,
          players:match_players (
            id,
            user_id,
            score,
            orders_completed,
            coins_earned,
            joined_at,
            left_at,
            ready,
            profiles (
              id,
              username,
              avatar,
              level,
              coins
            )
          ),
          host:profiles!matches_host_id_fkey (
            id,
            username,
            avatar,
            level
          )
        `,
      )
      .eq("room_code", roomCode)
      .single();

    if (error || !match) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    return res.json({
      success: true,
      data: match,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const joinMatch = async (req, res) => {
  try {
    const roomCode = req.params.roomCode.trim().toUpperCase();

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("room_code", roomCode)
      .single();

    if (matchError || !match) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (match.status !== "WAITING") {
      return res.status(400).json({
        success: false,
        message: "Room is not available",
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("joinMatch: profile lookup failed:", {
        user_id,
        found: Boolean(profile),
        profileError,
      });

      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const { data: existingPlayer } = await supabase
      .from("match_players")
      .select("id")
      .eq("match_id", match.id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existingPlayer) {
      return res.json({
        success: true,
        message: "Already joined",
        data: match,
      });
    }

    const { count, error: countError } = await supabase
      .from("match_players")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("match_id", match.id)
      .is("left_at", null);

    if (countError) {
      throw countError;
    }

    if (count >= match.max_players) {
      return res.status(400).json({
        success: false,
        message: "Room is full",
      });
    }

    const { data: player, error: playerError } = await supabase
      .from("match_players")
      .insert({
        match_id: match.id,
        user_id,
        ready: false,
      })
      .select()
      .single();

    if (playerError) {
      throw playerError;
    }

    return res.status(201).json({
      success: true,
      message: "Joined room successfully",
      data: player,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const setPlayerReady = async (req, res) => {
  try {
    const roomCode = req.params.roomCode.trim().toUpperCase();

    const { user_id, ready } = req.body;

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, status")
      .eq("room_code", roomCode)
      .single();

    if (matchError || !match) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (match.status !== "WAITING") {
      return res.status(400).json({
        success: false,
        message: "Room is not waiting",
      });
    }

    const { data: player, error: playerError } = await supabase
      .from("match_players")
      .update({
        ready: Boolean(ready),
      })
      .eq("match_id", match.id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (playerError || !player) {
      return res.status(404).json({
        success: false,
        message: "Player not found",
      });
    }

    return res.json({
      success: true,
      message: "Ready status updated",
      data: player,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const startMatch = async (req, res) => {
  try {
    const roomCode = req.params.roomCode.trim().toUpperCase();

    const { user_id } = req.body;

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("room_code", roomCode)
      .single();

    if (matchError || !match) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (match.host_id !== user_id) {
      return res.status(403).json({
        success: false,
        message: "Only the host can start the game",
      });
    }

    if (match.status !== "WAITING") {
      return res.status(400).json({
        success: false,
        message: "Match has already started",
      });
    }

    const { data: players, error: playersError } = await supabase
      .from("match_players")
      .select("id, ready")
      .eq("match_id", match.id)
      .is("left_at", null);

    if (playersError) {
      throw playersError;
    }

    if (!players || players.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No players in room",
      });
    }

    const allReady = players.every((player) => player.ready === true);

    if (!allReady) {
      return res.status(400).json({
        success: false,
        message: "All players must be ready",
      });
    }

    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches")
      .update({
        status: "PLAYING",
        started_at: new Date().toISOString(),
        round_status: match.game_mode === "FREE" ? "PLAYING" : "IDLE",
        round_id: match.game_mode === "FREE" ? crypto.randomUUID() : null,
      })
      .eq("id", match.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    if (updatedMatch.game_mode === "FREE") {
      controller.configureRound(roomCode, {
        mapId: updatedMatch.current_map,
        roundId: updatedMatch.round_id,
        durationMs: null,
      });
    }
    return res.json({
      success: true,
      message: "Match started",
      data: updatedMatch,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Authenticated host-only endpoints. Never trust user_id from request body.
async function verifyHost(req, res) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ message: "Missing token" });
    return null;
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ message: "Invalid token" });
    return null;
  }
  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("room_code", req.params.roomCode.toUpperCase())
    .maybeSingle();
  if (!match) {
    res.status(404).json({ message: "Room not found" });
    return null;
  }
  if (match.host_id !== user.id) {
    res.status(403).json({ message: "Host only" });
    return null;
  }
  return match;
}

export async function updateMode(req, res) {
  try {
    const match = await verifyHost(req, res);
    if (!match) return;
    if (match.status !== "WAITING")
      return res.status(409).json({ message: "Already started" });
    const { gameMode, mapId } = req.body;
    if (!["STORY", "FREE"].includes(gameMode))
      return res.status(400).json({ message: "Invalid mode" });
    if (gameMode === "FREE" && !["classroom", "farm", "kitchen", "sports", "computer-room", "library"].includes(mapId))
      return res.status(400).json({ message: "Invalid map" });
    const { data, error } = await supabase
      .from("matches")
      .update({
        game_mode: gameMode,
        current_map: gameMode === "FREE" ? mapId : "classroom",
      })
      .eq("id", match.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
}

export async function startStoryRound(req, res) {
  try {
    const match = await verifyHost(req, res);
    if (!match) return;
    if (match.status !== "PLAYING" || match.game_mode !== "STORY")
      return res.status(409).json({ message: "Not a Story room" });
    if (match.round_status === "PLAYING")
      return res.status(409).json({ message: "Round already active" });
    const mapId = req.body.mapId;
    if (!canPlayStoryMap(mapId, match.story_total))
      return res.status(403).json({ message: "Map locked or unavailable" });
    const durationMs = mapId === "classroom" ? 180000 : 180000;
    const roundId = crypto.randomUUID();
    const { data, error } = await supabase
      .from("matches")
      .update({
        current_map: mapId,
        round_id: roundId,
        round_status: "PLAYING",
        round_score: null,
      })
      .eq("id", match.id)
      .neq("round_status", "PLAYING")
      .select()
      .single();
    if (error) throw error;
    controller.configureRound(match.room_code, { mapId, roundId, durationMs });
    res.json({ data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
}

// Return the active group to map selection or the Free Play lobby.
export async function quitRound(req, res) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token || "");
    if (authError || !user) return res.status(401).json({ message: "Please sign in" });
    const { data: match, error: matchError } = await supabase.from("matches").select("*")
      .eq("room_code", req.params.roomCode.toUpperCase()).single();
    if (matchError) throw matchError;
    const { data: member, error: memberError } = await supabase.from("match_players").select("id")
      .eq("match_id", match.id).eq("user_id", user.id).is("left_at", null).maybeSingle();
    if (memberError) throw memberError;
    if (!member) return res.status(403).json({ message: "Room members only" });
    const returnToLobby = req.body?.destination === "lobby" || match.game_mode === "FREE";
    const { error } = await supabase.from("matches").update({
      status: returnToLobby ? "WAITING" : "PLAYING",
      round_status: "IDLE", round_id: null,
    }).eq("id", match.id);
    if (error) throw error;
    controller.removeRoom(match.room_code);
    if (returnToLobby) {
      const { error: readyError } = await supabase.from("match_players").update({ ready: false })
        .eq("match_id", match.id).is("left_at", null);
      if (readyError) throw readyError;
    }
    res.json({ data: { success: true } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
}
