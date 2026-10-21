import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Play.css";

function Play() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Chưa đăng nhập thì chuyển sang trang login
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("username, level, coins, avatar")
        .eq("id", user.id)
        .single();

      if (!active) return;

      if (error) {
        console.error("Profile error:", error);
        return;
      }

      setProfile(data);
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="pl-root">
      {/* Tên game đã có trong ảnh nền nên ẩn h1 (vẫn giữ cho SEO/screen reader) */}
      <h1 className="pl-sr-only">OverNấuĂn</h1>

      {/* Tên người chơi ở góc trên phải */}
      {profile && (
        <div className="pl-glass pl-profile">
          <span className="pl-profile-name">{profile.username}</span>
          <span>Lv. {profile.level}</span>
          <span>🪙 {profile.coins}</span>
        </div>
      )}

      {/* Thẻ ở giữa */}
      <nav className="pl-glass pl-card" aria-label="Play menu">
        <button className="pl-btn" onClick={() => navigate("/createroom")}>
          Create Room
        </button>
        <button className="pl-btn" onClick={() => navigate("/joinroom")}>
          Join Room
        </button>
        <button className="pl-btn" onClick={() => navigate("/maps")}>
          Map
        </button>
        <button className="pl-btn pl-btn-back" onClick={() => navigate("/")}>
          Back
        </button>
      </nav>
    </div>
  );
}

export default Play;
