import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { API_URL } from "../services/config";
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
    <div className="home-landing">
      <div className="page-card">
        <h1>Join Room</h1>

        <input
          type="text"
          placeholder="Enter room code"
          value={roomCode}
          maxLength={6}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />

        {error && <p className="error">{error}</p>}

        <button onClick={joinRoom} disabled={loading}>
          {loading ? "Joining..." : "Join Room"}
        </button>

        <button className="secondary-button" onClick={() => navigate("/play")}>
          Back
        </button>
      </div>
    </div>
  );
}

export default JoinRoom;
