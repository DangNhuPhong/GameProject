import dotenv from "dotenv";
import http from "http";

import { Server } from "socket.io";

import app from "./app.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // =====================================
  // JOIN ROOM
  // =====================================

  socket.on("join-room", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    socket.join(roomCode);

    console.log(`User ${userId} joined room ${roomCode}`);

    socket.emit("room-joined", {
      roomCode,
      userId,
    });

    socket.to(roomCode).emit("player-joined", {
      userId,
    });
  });

  // =====================================
  // PLAYER READY
  // =====================================

  socket.on("player-ready", ({ roomCode, userId, ready }) => {
    if (!roomCode || !userId) {
      return;
    }

    console.log(`User ${userId} ready: ${ready}`);

    socket.to(roomCode).emit("player-ready", {
      userId,
      ready,
    });
  });

  // =====================================
  // GAME STARTED
  // =====================================

  socket.on("game-started", ({ roomCode }) => {
    if (!roomCode) {
      return;
    }

    console.log(`Game started in room ${roomCode}`);

    socket.to(roomCode).emit("game-started", {
      roomCode,
    });
  });

  // =====================================
  // PLAYER POSITION
  // =====================================

  socket.on("player-position", ({ roomCode, userId, x, y }) => {
    if (
      !roomCode ||
      !userId ||
      typeof x !== "number" ||
      typeof y !== "number"
    ) {
      return;
    }

    // Send position to other players
    // in the same room
    socket.to(roomCode).emit("player-position", {
      userId,
      x,
      y,
    });
  });

  // =====================================
  // DISCONNECT
  // =====================================

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// =====================================
// START SERVER
// =====================================

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
