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

      // If game has already started,
      // go directly to the game.
      if (matchData.status === "PLAYING") {
        goToGame();
        return;
      }

      return matchData;
    } catch (err) {
      console.error(err);
      setError(err.message);
      return null;
    }
  };

  // =====================================
  // INITIALIZE LOBBY
  // =====================================

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        if (!mounted) {
          return;
        }

        setUser(user);

        // Load match
        const result = await getMatch(roomCode);

        if (!mounted) {
          return;
        }

        const matchData = result.data;

        // Save match
        setMatch(matchData);

        // ---------------------------------
        // IMPORTANT
        // If match already started,
        // go directly to game.
        // ---------------------------------

        if (matchData.status === "PLAYING") {
          navigate(`/game/${roomCode}`, {
            replace: true,
          });

          return;
        }

        // ---------------------------------
        // Find current player
        // ---------------------------------

        const currentPlayer = matchData.players?.find(
          (player) => player.user_id === user.id,
        );

        if (currentPlayer) {
          setReadyState(Boolean(currentPlayer.ready));
        }

        // ---------------------------------
        // Connect Socket.io
        // ---------------------------------

        if (!socket.connected) {
          socket.connect();
        }

        // ---------------------------------
        // Join room
        // ---------------------------------

        socket.emit("join-room", {
          roomCode,
          userId: user.id,
        });

        // ---------------------------------
        // PLAYER JOINED
        // ---------------------------------

        socket.on("player-joined", async () => {
          const updatedMatch = await loadMatch();

          if (updatedMatch?.status === "PLAYING") {
            goToGame();
          }
        });

        // ---------------------------------
        // PLAYER READY
        // ---------------------------------

        socket.on("player-ready", async () => {
          const updatedMatch = await loadMatch();

          if (updatedMatch?.status === "PLAYING") {
            goToGame();
          }
        });

        // ---------------------------------
        // GAME STARTED
        // ---------------------------------

        socket.on("game-started", ({ roomCode: startedRoom }) => {
          console.log("Game started:", startedRoom);

          if (startedRoom === roomCode) {
            goToGame();
          }
        });
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

      socket.off("player-joined");
      socket.off("player-ready");
      socket.off("game-started");

      socket.disconnect();
    };
  }, [roomCode, navigate]);

  // =====================================
  // READY
  // =====================================

  const handleReady = async () => {
    try {
      if (!user) {
        return;
      }

      const newReady = !ready;

      await setReady(roomCode, user.id, newReady);

      setReadyState(newReady);

      socket.emit("player-ready", {
        roomCode,
        userId: user.id,
        ready: newReady,
      });

      await loadMatch();
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
      if (!user) {
        return;
      }

      setError("");

      // Start match in backend
      await startMatch(roomCode, user.id);

      // Notify other players
      socket.emit("game-started", {
        roomCode,
      });

      // Host does not receive
      // socket.to(roomCode)
      // so navigate manually.
      goToGame();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  // =====================================
  // DATA
  // =====================================

  const isHost = match?.host_id === user?.id;

  const players = match?.players || [];

  const allReady =
    players.length > 0 && players.every((player) => player.ready);

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

              <span>{player.ready ? "READY" : "NOT READY"}</span>
            </div>
          ))}
        </div>

        {/* ================================
            WAITING
        ================================= */}

        {match?.status === "WAITING" && (
          <>
            <button onClick={handleReady}>
              {ready ? "Cancel Ready" : "Ready"}
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
