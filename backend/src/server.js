import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import GameController from "./classes/GameController.js";
import { getMapLayout } from "./maps/index.js";

const PORT = process.env.PORT || 5000;

// ==========================================
// KHÔNG ĐỂ LỖI BẤT NGỜ LÀM SẬP SERVER
// ==========================================

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"],
  },
});

// ==========================================
// GAME CONTROLLER
// Toàn bộ luật game nằm trong GameController (file này chỉ lo socket).
// Cùng một file GameController cũng chạy ở trình duyệt cho chế độ
// Single / Co-op cùng máy (frontend/src/game/core/GameController.js).
// ==========================================

const controller = new GameController({ getLayout: getMapLayout });

const toRoom = (roomCode, event, data) => io.to(roomCode).emit(event, data);

// ==========================================
// SOCKET CONNECTION
// ==========================================

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Mỗi socket có "ctx" riêng để controller biết gửi trả cho ai
  const ctx = {
    toRoom,
    toSender: (event, data) => socket.emit(event, data),
    toOthers: (roomCode, event, data) => socket.to(roomCode).emit(event, data),
    // volatile: gói cũ bị bỏ nếu client chưa kịp nhận, tránh dồn cục
    toOthersVolatile: (roomCode, event, data) =>
      socket.to(roomCode).volatile.emit(event, data),
    // Socket phải đúng phòng + đúng người chơi (chống giả mạo userId)
    verify: (roomCode, userId) =>
      socket.data.roomCode === roomCode && socket.data.userId === userId,
  };

  // Bọc mọi handler trong try/catch:
  // một lỗi trong handler chỉ bị log, không làm sập process.
  const handle = (eventName, fn) => {
    socket.on(eventName, (payload) => {
      try {
        fn(payload || {});
      } catch (err) {
        console.error(`Error in "${eventName}":`, err);

        socket.emit("interaction-error", {
          message: `Server error in ${eventName}`,
        });
      }
    });
  };

  // ==========================================
  // JOIN ROOM
  // ==========================================

  handle("join-room", ({ roomCode, userId, mapId }) => {
    if (!roomCode || !userId) return;

    const normalizedRoomCode = String(roomCode).toUpperCase();

    socket.join(normalizedRoomCode);

    socket.data.roomCode = normalizedRoomCode;
    socket.data.userId = userId;

    console.log(`User ${userId} joined room ${normalizedRoomCode}`);

    controller.join({ roomCode: normalizedRoomCode, userId, mapId }, ctx);
  });

  // ==========================================
  // PLAYER READY (lobby)
  // ==========================================

  handle("player-ready", ({ roomCode, userId, ready }) => {
    if (!roomCode || !userId) return;

    const normalizedRoomCode = String(roomCode).toUpperCase();

    io.to(normalizedRoomCode).emit("player-ready", {
      userId,
      ready: Boolean(ready),
    });
  });

  // ==========================================
  // GAME STARTED (lobby)
  // ==========================================

  handle("game-started", ({ roomCode }) => {
    if (!roomCode) return;

    const normalizedRoomCode = String(roomCode).toUpperCase();

    console.log(`Game started in room ${normalizedRoomCode}`);

    io.to(normalizedRoomCode).emit("game-started", {
      roomCode: normalizedRoomCode,
    });
  });

  // ==========================================
  // MỌI HÀNH ĐỘNG TRONG GAME -> GameController
  // (take-ingredient, take-plate, pick-up-item, drop-item, place-on-station,
  //  take-from-station, start-cutting, add-ingredient-to-plate,
  //  add-to-held-plate, use-trash-bin, serve-order, request-orders,
  //  player-position)
  // ==========================================

  Object.keys(controller.handlers).forEach((eventName) => {
    handle(eventName, (payload) => controller.handle(eventName, payload, ctx));
  });

  // ==========================================
  // DISCONNECT
  // ==========================================

  socket.on("disconnect", () => {
    const { roomCode, userId } = socket.data;

    console.log("Client disconnected:", socket.id);

    if (!roomCode || !userId) return;

    try {
      controller.leave(roomCode, userId, ctx);
    } catch (err) {
      console.error('Error in "disconnect":', err);
    }
  });
});

// ==========================================
// TICK (nướng chín / cháy / thái / đơn hàng)
// ==========================================

setInterval(() => {
  try {
    controller.tick(toRoom);
  } catch (err) {
    console.error("Error in station tick:", err);
  }
}, 200);

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
