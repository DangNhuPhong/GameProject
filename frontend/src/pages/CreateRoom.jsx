import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function CreateRoom() {
  const navigate = useNavigate();

  const [maxPlayers, setMaxPlayers] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createRoom = async () => {
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

      console.log("Creating room for user:", user.id);

      const response = await fetch("http://localhost:5000/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          max_players: maxPlayers,
        }),
      });

      const result = await response.json();

      console.log("Create room response:", result);

      if (!response.ok) {
        throw new Error(
          result.message || result.error || "Failed to create room",
        );
      }

      if (!result.data?.room_code) {
        throw new Error("Server did not return a room code");
      }

      const code = result.data.room_code;

      console.log("Created room:", code);

      navigate(`/lobby/${code}`);
    } catch (err) {
      console.error("Create room error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-card">
        <h1>Create Room</h1>

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

        {error && <p className="error">{error}</p>}

        <button onClick={createRoom} disabled={loading}>
          {loading ? "Creating..." : "Create Room"}
        </button>

        <button className="secondary-button" onClick={() => navigate("/")}>
          Back
        </button>
      </div>
    </div>
  );
}

export default CreateRoom;
