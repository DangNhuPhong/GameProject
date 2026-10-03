import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { socket } from "../services/socket";

import "./Lobby.css";

function Lobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const loadUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user);

    return user;
  };

  const loadRoom = async () => {
    try {
      console.log("Loading room:", roomCode);

      const response = await fetch(
        `http://localhost:5000/api/matches/${roomCode}`,
      );

      const result = await response.json();

      console.log("Room response:", result);

      if (!response.ok) {
        throw new Error(
          result.message || result.error || `Server error: ${response.status}`,
        );
      }

      setRoom(result.data);
    } catch (err) {
      console.error("Load room error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    loadRoom();
  }, [roomCode]);

  useEffect(() => {
    if (!user || !roomCode) return;

    socket.connect();

    socket.emit("join-room", {
      roomCode,
      userId: user.id,
    });

    const refreshRoom = () => {
      loadRoom();
    };

    const handleGameStarted = () => {
      navigate(`/game/${roomCode}`);
    };

    socket.on("player-joined", refreshRoom);
    socket.on("player-ready", refreshRoom);
    socket.on("game-started", handleGameStarted);

    return () => {
      socket.off("player-joined", refreshRoom);
      socket.off("player-ready", refreshRoom);
      socket.off("game-started", handleGameStarted);

      socket.disconnect();
    };
  }, [user, roomCode]);

  const setReady = async (ready) => {
    if (!user) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/matches/${roomCode}/ready`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
            ready,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to update ready status");
      }

      socket.emit("player-ready", {
        roomCode,
        userId: user.id,
        ready,
      });

      await loadRoom();
    } catch (err) {
      setError(err.message);
    }
  };

  const startGame = async () => {
    if (!user) return;

    setStarting(true);
    setError("");

    try {
      const response = await fetch(
        `http://localhost:5000/api/matches/${roomCode}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to start game");
      }

      socket.emit("game-started", {
        roomCode,
      });

      navigate(`/game/${roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const logout = async () => {
    socket.disconnect();
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="lobby-container">
        <h2>Loading room...</h2>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="lobby-container">
        <h2>Room not found</h2>

        {error && <p className="error">{error}</p>}

        <button onClick={() => navigate("/")}>Back Home</button>
      </div>
    );
  }

  const players = room.players || [];

  const currentPlayer = players.find((player) => player.user_id === user?.id);

  const isHost = room.host_id === user?.id;

  const allReady =
    players.length > 0 && players.every((player) => player.ready);

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1>Kitchen Panic</h1>

        <h2>Multiplayer Lobby</h2>

        <div className="room-code">
          <span>Room Code</span>
          <strong>{room.room_code}</strong>
        </div>

        <p>
          Players: {players.length}/{room.max_players}
        </p>

        <div className="players-list">
          {players.map((player) => (
            <div className="player-item" key={player.id}>
              <div>
                <strong>{player.profiles?.username || "Unknown User"}</strong>

                {player.user_id === room.host_id && (
                  <span className="host-label">HOST</span>
                )}
              </div>

              <span className={player.ready ? "ready" : "not-ready"}>
                {player.ready ? "Ready" : "Not Ready"}
              </span>
            </div>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="lobby-actions">
          <button onClick={() => setReady(!currentPlayer?.ready)}>
            {currentPlayer?.ready ? "Unready" : "Ready"}
          </button>

          {isHost && (
            <button onClick={startGame} disabled={!allReady || starting}>
              {starting ? "Starting..." : "Start Game"}
            </button>
          )}

          <button className="secondary-button" onClick={() => navigate("/")}>
            Back Home
          </button>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default Lobby;
