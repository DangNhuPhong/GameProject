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

iio.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // =====================================
  // JOIN ROOM
  // =====================================

  socket.on("join-room", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    socket.join(roomCode);

    socket.data.roomCode = roomCode;
    socket.data.userId = userId;

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

    socket.to(roomCode).emit("player-position", {
      userId,
      x,
      y,
    });
  });

  // =====================================
  // PICK UP MEAT
  // =====================================

  socket.on("meat-picked", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    console.log(`User ${userId} picked up meat in ${roomCode}`);

    socket.to(roomCode).emit("meat-picked", {
      userId,
    });
  });

  // =====================================
  // START COOKING
  // =====================================

  socket.on("start-cooking", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    console.log(`User ${userId} started cooking in ${roomCode}`);

    // Tell everyone cooking has started
    io.to(roomCode).emit("cooking-started", {
      userId,
      duration: 7000,
    });

    // Server-side cooking timer
    setTimeout(() => {
      console.log(`Cooking finished in ${roomCode}`);

      io.to(roomCode).emit("cooking-finished", {
        userId,
      });
    }, 7000);
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
