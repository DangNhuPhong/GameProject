import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Play.css";
import "./Room.css";
import "./Login.css";

function Register() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      navigate("/");
    } else {
      setMessage(
        "Registration successful. Please check your email to confirm your account.",
      );
    }

    setLoading(false);
  };

  return (
    <div className="pl-root room-page auth-page">
      <div className="pl-card pl-glass room-card auth-card">
        <h1>Register</h1>

        <form onSubmit={handleRegister}>
          <input
            type="text"
            aria-label="Username"
            autoComplete="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

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
            autoComplete="new-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <p className="room-error" role="alert">{error}</p>}

          {message && <p className="auth-success" role="status">{message}</p>}

          <button className="pl-btn" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <button className="pl-btn pl-btn-back" onClick={() => navigate("/login")}>
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default Register;
