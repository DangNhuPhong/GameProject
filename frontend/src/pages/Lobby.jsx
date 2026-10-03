import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { getMatch, setReady, startMatch } from "../services/api";

import { socket } from "../services/socket";
import "./Lobby.css";

function Lobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReadyState] = useState(false);
  const [error, setError] = useState("");

  // =====================================
  // GO TO GAME
  // =====================================

  const goToGame = () => {
    navigate(`/game/${roomCode}`, {
      replace: true,
    });
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
      console.error(err);
      setError(err.message);
      return null;
    }
  };

  // =====================================
  // INITIALIZE
  // =====================================

  useEffect(() => {
    let mounted = true;

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
          navigate(`/game/${roomCode}`, {
            replace: true,
          });

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
        // CONNECT SOCKET
        // ================================

        if (!socket.connected) {
          socket.connect();
        }

        // ================================
        // JOIN ROOM
        // ================================

        socket.emit("join-room", {
          roomCode,
          userId: user.id,
        });

        // ================================
        // PLAYER JOINED
        // ================================

        const handlePlayerJoined = async () => {
          console.log("Player joined");

          const updatedMatch = await getMatch(roomCode);

          if (!mounted) return;

          setMatch(updatedMatch.data);
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
            setReadyState(ready);
          }
        };

        // ================================
        // GAME STARTED
        // ================================

        const handleGameStarted = ({ roomCode: startedRoom }) => {
          console.log("Game started:", startedRoom);

          if (startedRoom === roomCode) {
            goToGame();
          }
        };

        socket.on("player-joined", handlePlayerJoined);

        socket.on("player-ready", handlePlayerReady);

        socket.on("game-started", handleGameStarted);

        // ================================
        // CLEANUP
        // ================================

        return () => {
          socket.off("player-joined", handlePlayerJoined);

          socket.off("player-ready", handlePlayerReady);

          socket.off("game-started", handleGameStarted);
        };
      } catch (err) {
        console.error(err);

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

      // Update database
      await setReady(roomCode, user.id, newReady);

      // Update own UI immediately
      setReadyState(newReady);

      // Notify all players
      socket.emit("player-ready", {
        roomCode,
        userId: user.id,
        ready: newReady,
      });
    } catch (err) {
      console.error(err);
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

      await startMatch(roomCode, user.id);

      // Notify everyone
      socket.emit("game-started", {
        roomCode,
      });

      // Host goes directly
      goToGame();
    } catch (err) {
      console.error(err);
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
      <div className="lobby-page">
        <h1>Loading lobby...</h1>
      </div>
    );
  }

  // =====================================
  // LOBBY
  // =====================================

  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <h1>Kitchen Panic</h1>

        <h2>Room: {roomCode}</h2>

        <p>
          Status: <strong>{match?.status}</strong>
        </p>

        {error && <div className="error">{error}</div>}

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

                {player.user_id === match.host_id && " 👑"}
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
            <button onClick={handleReady}>
              {ready ? "Not Ready" : "Ready"}
            </button>

            {isHost && (
              <button onClick={handleStart} disabled={!allReady}>
                Start Game
              </button>
            )}
          </>
        )}

        {/* ================================
            BACK HOME
        ================================= */}

        <button onClick={() => navigate("/")}>Back Home</button>
      </div>
    </div>
  );
}

export default Lobby;
