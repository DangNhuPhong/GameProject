import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { createMatch } from "../services/api";

function CreateRoom() {
  const navigate = useNavigate();

  const [maxPlayers, setMaxPlayers] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreateRoom = async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      const result = await createMatch(user.id, Number(maxPlayers));

      const roomCode = result?.data?.room_code;

      if (!roomCode) {
        throw new Error("Server did not return a room code");
      }

      navigate(`/lobby/${roomCode}`);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Create Room</h1>

      <div>
        <label>Maximum Players</label>

        <select
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
        >
          <option value={1}>1 Player</option>
          <option value={2}>2 Players</option>
          <option value={3}>3 Players</option>
          <option value={4}>4 Players</option>
        </select>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button onClick={handleCreateRoom} disabled={loading}>
        {loading ? "Creating..." : "Create Room"}
      </button>

      <button onClick={() => navigate("/")} disabled={loading}>
        Back
      </button>
    </div>
  );
}

export default CreateRoom;
