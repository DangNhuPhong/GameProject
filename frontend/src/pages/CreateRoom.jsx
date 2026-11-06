import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { createMatch } from "../services/api";
import "./Play.css";
import "./Room.css";
import "./CreateRoom.css";

function CreateRoom() {
  const navigate = useNavigate();

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

      console.log("user.id gửi lên:", user.id, "| email:", user.email);

      const result = await createMatch(user.id, 4);

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
    <div className="pl-root room-page">
      <div className="pl-card pl-glass room-card">
      <h1>Create Room</h1>

      <p>Play with 1–4 players. Start whenever everyone is ready.</p>

      {error && <p className="room-error" role="alert">{error}</p>}

      <button className="pl-btn" onClick={handleCreateRoom} disabled={loading}>
        {loading ? "Creating..." : "Create Room"}
      </button>

      <button className="pl-btn pl-btn-back" onClick={() => navigate("/play")} disabled={loading}>
        Back
      </button>
      </div>
    </div>
  );
}

export default CreateRoom;
