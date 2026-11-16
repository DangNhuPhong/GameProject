import { useNavigate } from "react-router-dom";
import GameNavigation from "../components/GameNavigation";
import "./LandingPage.css";

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <main className="lp-root">
      <h1 className="lp-sr-only">OverNấuĂn</h1>
      <GameNavigation />
      <button className="lp-glass lp-play" onClick={() => navigate("/play")}>Play</button>
    </main>
  );
}
