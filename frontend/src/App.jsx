import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { supabase } from "./lib/supabase";

import Play from "./pages/Play";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CreateRoom from "./pages/CreateRoom";
import JoinRoom from "./pages/JoinRoom";
import Lobby from "./pages/Lobby";
import Recipes from "./pages/Recipes";
import Game from "./pages/Game";
import LandingPage from "./pages/LandingPage";

import useFullscreenHotkey from "./useFullscreenHotkey";
import FullscreenButton from "./pages/Fullscreenhint";

import "./App.css";

function ProtectedRoute({ session, children }) {
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useFullscreenHotkey("f");

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <Login />}
        />

        <Route
          path="/register"
          element={session ? <Navigate to="/" replace /> : <Register />}
        />

        <Route path="/" element={<LandingPage />} />

        <Route
          path="/createroom"
          element={
            <ProtectedRoute session={session}>
              <CreateRoom />
            </ProtectedRoute>
          }
        />

        {/* Màn chọn chế độ: không cần đăng nhập (Single / Local chạy offline) */}
        <Route path="/play" element={<Play />} />

        {/* Chế độ offline: không cần đăng nhập, không cần server */}
        <Route path="/single" element={<Game mode="single" />} />
        <Route path="/local" element={<Game mode="coop-local" />} />

        <Route
          path="/joinroom"
          element={
            <ProtectedRoute session={session}>
              <JoinRoom />
            </ProtectedRoute>
          }
        />

        <Route
          path="/lobby/:roomCode"
          element={
            <ProtectedRoute session={session}>
              <Lobby />
            </ProtectedRoute>
          }
        />

        <Route
          path="/game/:roomCode"
          element={
            <ProtectedRoute session={session}>
              <Game mode="coop-online" />
            </ProtectedRoute>
          }
        />

        <Route
          path="/recipes"
          element={
            <ProtectedRoute session={session}>
              <Recipes />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <FullscreenButton />
    </BrowserRouter>
  );
}

export default App;
