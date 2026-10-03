import http from "http";
import app from "./app.js";
import { Server } from "socket.io";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-room", ({ roomCode, userId }) => {
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
