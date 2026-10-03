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

  const loadMatch = async () => {
    try {
      const result = await getMatch(roomCode);

      setMatch(result.data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        if (!mounted) return;

        setUser(user);

        const result = await getMatch(roomCode);

        if (!mounted) return;

        setMatch(result.data);

        const currentPlayer = result.data.players?.find(
          (player) => player.user_id === user.id,
        );

        if (currentPlayer) {
          setReadyState(Boolean(currentPlayer.ready));
        }

        socket.connect();

        socket.emit("join-room", {
          roomCode,
          userId: user.id,
        });

        socket.on("player-joined", async () => {
          await loadMatch();
        });

        socket.on("player-ready", async () => {
          await loadMatch();
        });

        socket.on("game-started", () => {
          alert("Game started!");
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

  const handleReady = async () => {
    try {
      if (!user) return;

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

  const handleStart = async () => {
    try {
      if (!user) return;

      await startMatch(roomCode, user.id);

      socket.emit("game-started", {
        roomCode,
      });

      await loadMatch();

      alert("Game started!");
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const isHost = match?.host_id === user?.id;

  const players = match?.players || [];

  const allReady =
    players.length > 0 && players.every((player) => player.ready);

  if (loading) {
    return (
      <div className="lobby-page">
        <h1>Loading lobby...</h1>
      </div>
    );
  }

  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <h1>Kitchen Panic</h1>

        <h2>Room: {roomCode}</h2>

        <p>
          Status: <strong>{match?.status}</strong>
        </p>

        {error && <div className="error">{error}</div>}

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

        {match?.status === "PLAYING" && (
          <div className="game-started">Game has started!</div>
        )}

        <button onClick={() => navigate("/")}>Back Home</button>
      </div>
    </div>
  );
}

export default Lobby;
