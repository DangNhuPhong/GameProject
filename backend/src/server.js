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

  socket.on("player-ready", ({ roomCode, userId, ready }) => {
    console.log(`User ${userId} ready: ${ready}`);

    socket.to(roomCode).emit("player-ready", {
      userId,
      ready,
    });
  });

  socket.on("game-started", ({ roomCode }) => {
    console.log(`Game started in room ${roomCode}`);

    socket.to(roomCode).emit("game-started", {
      roomCode,
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
