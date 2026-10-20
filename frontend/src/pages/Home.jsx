import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Home.css";

function Home() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("username, level, coins, avatar")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile error:", error);
        return;
      }

      setProfile(data);
    };

    loadProfile();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="home-landing">
      {/* Tên game đã có trong ảnh nền nên ẩn h1 (vẫn giữ cho SEO/screen reader) */}
      <h1 className="sr-only">OverNấuĂn</h1>

      {profile && (
        <div className="glass glass-profile">
          <span className="glass-profile-name">{profile.username}</span>
          <span>Lv. {profile.level}</span>
          <span>🪙 {profile.coins}</span>
        </div>
      )}

      <nav className="home-actions-glass">
        <button
          className="glass glass-btn"
          onClick={() => navigate("/createroom")}
        >
          Create Room
        </button>
        <button
          className="glass glass-btn"
          onClick={() => navigate("/joinroom")}
        >
          Join Room
        </button>
        <button className="glass glass-btn glass-danger" onClick={logout}>
          Logout
        </button>
        <button
          className="glass glass-btn glass-fullscreen"
          onClick={toggleFullscreen}
          aria-label="Toàn màn hình"
        >
          ⛶
        </button>
      </nav>
    </div>
  );
}

export default Home;
