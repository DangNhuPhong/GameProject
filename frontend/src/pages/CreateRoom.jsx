import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { joinMatch } from "../services/api";

function JoinRoom() {
  const navigate = useNavigate();

  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoinRoom = async () => {
    try {
      setLoading(true);
      setError("");

      const code = roomCode.trim().toUpperCase();

      if (!code) {
        throw new Error("Please enter a room code");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      await joinMatch(code, user.id);

      navigate(`/lobby/${code}`);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Join Room</h1>

      <input
        type="text"
        placeholder="Enter room code"
        value={roomCode}
        maxLength={6}
        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button onClick={handleJoinRoom} disabled={loading}>
        {loading ? "Joining..." : "Join Room"}
      </button>

      <button onClick={() => navigate("/")} disabled={loading}>
        Back
      </button>
    </div>
  );
}

export default JoinRoom;
