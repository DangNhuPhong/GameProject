import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { getMatch, setReady, startMatch } from "../services/api";
import { updateRoomMode } from "../services/storyApi";

import { socket } from "../services/socket";
import "./Play.css";
import "./Room.css";
import "./Lobby.css";

function Lobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReadyState] = useState(false);
  const [error, setError] = useState("");
  const [selectedMode, setSelectedMode] = useState("STORY");
  const [selectedMap, setSelectedMap] = useState("bistro");

  // =====================================
  // GO TO GAME
  // =====================================

  const goToGame = () => {
    navigate(
      match?.game_mode === "FREE"
        ? `/game/${roomCode}`
        : `/world-online/${roomCode}`,
      {
        replace: true,
      },
    );
  };

  // =====================================
  // LOAD MATCH
  // =====================================

  const loadMatch = async () => {
    try {
      const result = await getMatch(roomCode);

      const matchData = result.data;

      setMatch(matchData);

      return matchData;
    } catch (err) {
      console.error("Load match error:", err);
      setError(err.message);
      return null;
    }
  };

  // =====================================
  // INITIALIZE
  // =====================================

  useEffect(() => {
    let mounted = true;
    let pollTimer = null;

    const init = async () => {
      try {
        // ================================
        // GET USER
        // ================================

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        if (!mounted) return;

        setUser(user);

        // ================================
        // LOAD MATCH
        // ================================

        const result = await getMatch(roomCode);

        if (!mounted) return;

        const matchData = result.data;

        setMatch(matchData);

        // ================================
        // GAME ALREADY STARTED
        // ================================

        if (matchData.status === "PLAYING") {
          navigate(
            matchData.game_mode === "FREE"
              ? `/game/${roomCode}`
              : `/world-online/${roomCode}`,
            {
              replace: true,
            },
          );

          return;
        }

        // ================================
        // CURRENT PLAYER READY
        // ================================

        const currentPlayer = matchData.players?.find(
          (player) => player.user_id === user.id,
        );

        if (currentPlayer) {
          setReadyState(Boolean(currentPlayer.ready));
        }

        // ================================
        // SOCKET CONNECT
        // ================================

        if (!socket.connected) {
          socket.connect();
        }

        // ================================
        // PLAYER JOINED
        // ================================

        const handlePlayerJoined = async ({ userId }) => {
          console.log("Player joined:", userId);

          const updatedMatch = await getMatch(roomCode);

          if (!mounted) return;

          const updatedData = updatedMatch.data;

          setMatch(updatedData);

          // Safety check
          if (updatedData.status === "PLAYING") {
            navigate(
              match?.game_mode === "FREE"
                ? `/game/${roomCode}`
                : `/world-online/${roomCode}`,
              {
                replace: true,
              },
            );
          }
        };

        // ================================
        // PLAYER READY
        // ================================

        const handlePlayerReady = ({ userId, ready }) => {
          console.log("Player ready:", userId, ready);

          setMatch((currentMatch) => {
            if (!currentMatch) {
              return currentMatch;
            }

            const updatedPlayers = currentMatch.players.map((player) => {
              if (player.user_id === userId) {
                return {
                  ...player,
                  ready,
                };
              }

              return player;
            });

            return {
              ...currentMatch,
              players: updatedPlayers,
            };
          });

          // Update own ready state
          if (userId === user.id) {
            setReadyState(Boolean(ready));
          }
        };

        // ================================
        // GAME STARTED
        // ================================

        const handleGameStarted = ({ roomCode: startedRoom }) => {
          console.log("Game started:", startedRoom);

          if (
            String(startedRoom).toUpperCase() === String(roomCode).toUpperCase()
          ) {
            goToGame();
          }
        };

        // ================================
        // REGISTER SOCKET LISTENERS
        // BEFORE JOINING ROOM
        // ================================

        socket.on("player-joined", handlePlayerJoined);

        socket.on("player-ready", handlePlayerReady);

        socket.on("game-started", handleGameStarted);

        // ================================
        // JOIN ROOM
        // ================================

        socket.emit("join-room", {
          roomCode,
          userId: user.id,
        });

        // ================================
        // DATABASE POLLING
        // ================================
        //
        // This is the important part.
        //
        // Even if player 2 misses the
        // "game-started" socket event,
        // the lobby will detect:
        //
        // WAITING -> PLAYING
        //
        // and automatically enter the game.
        // ================================

        pollTimer = setInterval(async () => {
          try {
            const latestResult = await getMatch(roomCode);

            if (!mounted) return;

            const latestMatch = latestResult.data;

            setMatch(latestMatch);

            // ============================
            // GAME STARTED
            // ============================

            if (latestMatch.status === "PLAYING") {
              clearInterval(pollTimer);
              pollTimer = null;

              navigate(
                latestMatch.game_mode === "FREE"
                  ? `/game/${roomCode}`
                  : `/world-online/${roomCode}`,
                {
                  replace: true,
                },
              );
            }
          } catch (err) {
            console.error("Lobby polling error:", err);
          }
        }, 1000);

        // ================================
        // CLEANUP
        // ================================

        return () => {
          socket.off("player-joined", handlePlayerJoined);

          socket.off("player-ready", handlePlayerReady);

          socket.off("game-started", handleGameStarted);

          if (pollTimer) {
            clearInterval(pollTimer);
          }
        };
      } catch (err) {
        console.error("Lobby initialization error:", err);

        if (mounted) {
          setError(err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;

      if (pollTimer) {
        clearInterval(pollTimer);
      }

      socket.disconnect();
    };
  }, [roomCode, navigate]);

  // =====================================
  // READY / NOT READY
  // =====================================

  const handleReady = async () => {
    try {
      if (!user) return;

      setError("");

      const newReady = !ready;

      // ================================
      // UPDATE DATABASE
      // ================================

      await setReady(roomCode, user.id, newReady);

      // ================================
      // UPDATE OWN UI
      // ================================

      setReadyState(newReady);

      // ================================
      // NOTIFY OTHER PLAYERS
      // ================================

      socket.emit("player-ready", {
        roomCode,
        userId: user.id,
        ready: newReady,
      });
    } catch (err) {
      console.error("Ready error:", err);
      setError(err.message);
    }
  };

  // =====================================
  // START GAME
  // =====================================

  const handleStart = async () => {
    try {
      if (!user) return;

      setError("");

      // ================================
      // START MATCH IN DATABASE
      // ================================

      await updateRoomMode(roomCode, user.id, selectedMode, selectedMap);
      await startMatch(roomCode, user.id);

      // ================================
      // NOTIFY PLAYERS THROUGH SOCKET
      // ================================

      socket.emit("game-started", {
        roomCode,
      });

      // ================================
      // HOST GOES DIRECTLY
      // ================================

      navigate(
        selectedMode === "FREE"
          ? `/game/${roomCode}`
          : `/world-online/${roomCode}`,
      );
    } catch (err) {
      console.error("Start game error:", err);
      setError(err.message);
    }
  };

  // =====================================
  // DATA
  // =====================================

  const players = match?.players || [];

  const isHost = match?.host_id === user?.id;

  const allReady =
    players.length > 0 && players.every((player) => player.ready === true);

  // =====================================
  // LOADING
  // =====================================

  if (loading) {
    return (
      <div className="pl-root room-page">
        <h1>Loading lobby...</h1>
      </div>
    );
  }

  // =====================================
  // LOBBY
  // =====================================

  return (
    <div className="pl-root room-page">
      <div className="pl-card pl-glass room-card lobby-card">
        <h2>Room: {roomCode}</h2>

        <p>
          Status: <strong>{match?.status}</strong>
        </p>

        {error && <div className="room-error" role="alert">{error}</div>}

        {/* ================================
            PLAYERS
        ================================= */}

        <div className="players">
          <h3>
            Players ({players.length}/{match?.max_players})
          </h3>

          {players.map((player) => (
            <div className="player" key={player.id}>
              <span>
                {player.profiles?.username || "Unknown User"}

                {player.user_id === match.host_id && " (Host)"}
              </span>

              <span className={player.ready ? "ready" : "not-ready"}>
                {player.ready ? "READY" : "NOT READY"}
              </span>
            </div>
          ))}
        </div>

        {/* ================================
            WAITING
        ================================= */}

        {match?.status === "WAITING" && (
          <>
            <button className="pl-btn" onClick={handleReady}>
              {ready ? "Not Ready" : "Ready"}
            </button>

            {isHost && (
              <div style={{ margin: "12px 0" }}>
                <label>
                  Game mode:{" "}
                  <select
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value)}
                  >
                    <option value="STORY">Story Mode</option>
                    <option value="FREE">Free Play</option>
                  </select>
                </label>
                {selectedMode === "FREE" && (
                  <label>
                    {" "}
                    Map:{" "}
                    <select
                      value={selectedMap}
                      onChange={(e) => setSelectedMap(e.target.value)}
                    >
                      <option value="bistro">Bistro</option>
                      <option value="farm">Farm</option>
                      <option value="sports">Sports Ground</option>
                      <option value="kitchen">Kitchen</option>
                    </select>
                  </label>
                )}
              </div>
            )}
            {isHost && (
              <button className="pl-btn" onClick={handleStart} disabled={!allReady}>
                Start Game
              </button>
            )}
          </>
        )}

        {/* ================================
            BACK HOME
        ================================= */}

        <button className="pl-btn" onClick={() => navigate("/Play")}>Back Home</button>
      </div>
    </div>
  );
}

export default Lobby;
