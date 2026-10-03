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
    const { user_id, max_players = 2, map = "Kitchen_1" } = req.body;

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

    // Check user
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    // Generate unique room code
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

    // Create match
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert({
        room_code: roomCode,
        host_id: user_id,
        status: "WAITING",
        map,
        max_players,
      })
      .select()
      .single();

    if (matchError) {
      console.error("Create match error:", matchError);

      return res.status(500).json({
        success: false,
        message: matchError.message,
      });
    }

    // Add host to match_players
    const { error: playerError } = await supabase.from("match_players").insert({
      match_id: match.id,
      user_id,
      ready: false,
    });

    if (playerError) {
      console.error("Create match player error:", playerError);

      // Rollback match
      await supabase.from("matches").delete().eq("id", match.id);

      return res.status(500).json({
        success: false,
        message: playerError.message,
      });
    }

    // IMPORTANT:
    // Return room_code inside data
    return res.status(201).json({
      success: true,
      message: "Room created successfully",
      data: match,
    });
  } catch (error) {
    console.error("Create match error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
export const getMatchByRoomCode = async (req, res) => {
  try {
    const { roomCode } = req.params;

    // Get match
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("room_code", roomCode.toUpperCase())
      .single();

    if (matchError || !match) {
      return res.status(404).json({
        success: false,
        error: "Room not found",
      });
    }

    // Get players
    const { data: players, error: playersError } = await supabase
      .from("match_players")
      .select(
        `
        id,
        user_id,
        score,
        orders_completed,
        coins_earned,
        ready,
        joined_at,
        left_at,
        profiles (
          id,
          username,
          level,
          avatar
        )
      `,
      )
      .eq("match_id", match.id)
      .is("left_at", null)
      .order("joined_at", { ascending: true });

    if (playersError) {
      return res.status(500).json({
        success: false,
        error: playersError.message,
      });
    }

    // Get host profile
    const { data: host, error: hostError } = await supabase
      .from("profiles")
      .select("id, username, level, avatar")
      .eq("id", match.host_id)
      .single();

    if (hostError) {
      return res.status(500).json({
        success: false,
        error: hostError.message,
      });
    }

    res.json({
      success: true,
      data: {
        ...match,
        host,
        players,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
export const joinMatch = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "user_id is required",
      });
    }

    // Find room
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("room_code", roomCode.toUpperCase())
      .single();

    if (matchError || !match) {
      return res.status(404).json({
        success: false,
        error: "Room not found",
      });
    }

    // Room must be waiting
    if (match.status !== "WAITING") {
      return res.status(400).json({
        success: false,
        error: "Room is not accepting players",
      });
    }

    // Check user exists
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, level, coins, avatar")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check current players
    const { data: currentPlayers, error: playersError } = await supabase
      .from("match_players")
      .select("id, user_id")
      .eq("match_id", match.id)
      .is("left_at", null);

    if (playersError) {
      return res.status(500).json({
        success: false,
        error: playersError.message,
      });
    }

    // Check if already joined
    const alreadyJoined = currentPlayers.some(
      (player) => player.user_id === user_id,
    );

    if (alreadyJoined) {
      return res.status(400).json({
        success: false,
        error: "User is already in this room",
      });
    }

    // Check room capacity
    if (currentPlayers.length >= match.max_players) {
      return res.status(400).json({
        success: false,
        error: "Room is full",
      });
    }

    // Add player
    const { data: matchPlayer, error: joinError } = await supabase
      .from("match_players")
      .insert({
        match_id: match.id,
        user_id,
        score: 0,
        orders_completed: 0,
        coins_earned: 0,
      })
      .select()
      .single();

    if (joinError) {
      return res.status(500).json({
        success: false,
        error: joinError.message,
      });
    }

    res.status(201).json({
      success: true,
      message: "Joined room successfully",
      data: {
        match,
        player: matchPlayer,
        profile,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
export const setPlayerReady = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { user_id, ready } = req.body || {};

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "user_id is required",
      });
    }

    if (typeof ready !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "ready must be true or false",
      });
    }

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, room_code, status")
      .eq("room_code", roomCode.toUpperCase())
      .single();

    if (matchError || !match) {
      return res.status(404).json({
        success: false,
        error: "Room not found",
      });
    }

    if (match.status !== "WAITING") {
      return res.status(400).json({
        success: false,
        error: "Room is not waiting",
      });
    }

    const { data: player, error: playerError } = await supabase
      .from("match_players")
      .select("*")
      .eq("match_id", match.id)
      .eq("user_id", user_id)
      .is("left_at", null)
      .single();

    if (playerError || !player) {
      return res.status(404).json({
        success: false,
        error: "User is not in this room",
      });
    }

    const { data: updatedPlayer, error: updateError } = await supabase
      .from("match_players")
      .update({
        ready,
      })
      .eq("id", player.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: updateError.message,
      });
    }

    res.json({
      success: true,
      message: ready ? "Player is ready" : "Player is not ready",
      data: updatedPlayer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
export const startMatch = async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "user_id is required",
      });
    }

    // Find match
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("room_code", roomCode.toUpperCase())
      .single();

    if (matchError || !match) {
      return res.status(404).json({
        success: false,
        error: "Room not found",
      });
    }

    // Check host
    if (match.host_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: "Only the host can start the game",
      });
    }

    // Check status
    if (match.status !== "WAITING") {
      return res.status(400).json({
        success: false,
        error: "Game has already started",
      });
    }

    // Get players
    const { data: players, error: playersError } = await supabase
      .from("match_players")
      .select("*")
      .eq("match_id", match.id)
      .is("left_at", null);

    if (playersError) {
      return res.status(500).json({
        success: false,
        error: playersError.message,
      });
    }

    // Need at least one player
    if (players.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No players in room",
      });
    }

    // Check everyone ready
    const allReady = players.every((player) => player.ready === true);

    if (!allReady) {
      return res.status(400).json({
        success: false,
        error: "Not all players are ready",
      });
    }

    // Start game
    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches")
      .update({
        status: "PLAYING",
        started_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: updateError.message,
      });
    }

    res.json({
      success: true,
      message: "Game started",
      data: updatedMatch,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
