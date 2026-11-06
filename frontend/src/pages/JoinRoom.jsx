import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { API_URL } from "../services/config";
import "./Play.css";
import "./Room.css";
import "./JoinRoom.css";

function JoinRoom() {
  const navigate = useNavigate();

  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const joinRoom = async () => {
    const code = roomCode.trim().toUpperCase();

    if (!code) {
      setError("Please enter a room code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      const response = await fetch(`${API_URL}/api/matches/${code}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to join room");
      }

      navigate(`/lobby/${code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pl-root room-page">
      <div className="pl-card pl-glass room-card">
        <h1>Join Room</h1>

        <input
          aria-label="Room code"
          type="text"
          placeholder="Enter room code"
          value={roomCode}
          maxLength={6}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />

        {error && <p className="room-error" role="alert">{error}</p>}

        <button className="pl-btn" onClick={joinRoom} disabled={loading}>
          {loading ? "Joining..." : "Join Room"}
        </button>

        <button className="pl-btn pl-btn-back" onClick={() => navigate("/play")}>
          Back
        </button>
      </div>
    </div>
  );
}

export default JoinRoom;
