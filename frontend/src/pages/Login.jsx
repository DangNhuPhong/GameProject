import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Play.css";
import "./Room.css";
import "./Login.css";

function Login() {
  const navigate = useNavigate();
  const { search, hash } = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState(() => {
    const params = new URLSearchParams(search);
    const fragment = new URLSearchParams(hash.slice(1));
    const code = params.get("error") ?? fragment.get("error");
    const failed = [params, fragment].some(
      (part) => part.has("error_code") || part.has("error_description"),
    );

    if (code === "access_denied") return "Google sign-in was cancelled or access was denied.";
    if (code || failed) return "Google sign-in failed. Please try again.";
    return "";
  });
  const [pending, setPending] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setPending("password");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setPending(null);
      return;
    }

    navigate("/");
    setPending(null);
  };

  const handleGoogleLogin = async () => {
    setError("");
    setPending("google");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("/login", window.location.origin).href },
      });

      if (error) setError(error.message);
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="pl-root room-page auth-page">
      <div className="pl-card pl-glass room-card auth-card">
        <h1>Login</h1>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            aria-label="Email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            aria-label="Password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button className="pl-btn" type="submit" disabled={pending !== null}>
            {pending === "password" ? "Logging in..." : "Login"}
          </button>
        </form>

        <button className="pl-btn" type="button" onClick={handleGoogleLogin} disabled={pending !== null}>
          {pending === "google" ? "Opening Google..." : "Continue with Google"}
        </button>

        {error && <p className="room-error" role="alert">{error}</p>}

        <p className="switch-text">Don't have an account?</p>

        <button
          className="pl-btn pl-btn-back"
          type="button"
          disabled={pending !== null}
          onClick={() => navigate("/register")}
        >
          Register
        </button>
      </div>
    </div>
  );
}

export default Login;
