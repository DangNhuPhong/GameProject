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

// ==========================================
// GAME STATE
// ==========================================

const roomStates = {};

function getRoomState(roomCode) {
  if (!roomStates[roomCode]) {
    roomStates[roomCode] = {
      meat: {
        state: "available",
        itemType: "raw-meat",
        userId: null,

        // Raw meat starts here
        x: 160,
        y: 150,

        // Cooking information
        cookingStartedAt: null,
        cookingDuration: 0,
      },
    };
  }

  return roomStates[roomCode];
}

function emitState(roomCode) {
  io.to(roomCode).emit("game-state", getRoomState(roomCode));
}

// ==========================================
// SOCKET CONNECTION
// ==========================================

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // ==========================================
  // JOIN ROOM
  // ==========================================

  socket.on("join-room", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    socket.join(normalizedRoomCode);

    socket.data.roomCode = normalizedRoomCode;
    socket.data.userId = userId;

    const state = getRoomState(normalizedRoomCode);

    console.log(`User ${userId} joined room ${normalizedRoomCode}`);

    // Send current game state
    // to the player who just joined
    socket.emit("game-state", state);

    socket.emit("room-joined", {
      roomCode: normalizedRoomCode,
      userId,
    });

    // Tell other players
    socket.to(normalizedRoomCode).emit("player-joined", {
      userId,
    });
  });

  // ==========================================
  // PLAYER READY
  // ==========================================

  socket.on("player-ready", ({ roomCode, userId, ready }) => {
    if (!roomCode || !userId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    console.log(`User ${userId} ready = ${ready}`);

    io.to(normalizedRoomCode).emit("player-ready", {
      userId,
      ready: Boolean(ready),
    });
  });

  // ==========================================
  // GAME STARTED
  // ==========================================

  socket.on("game-started", ({ roomCode }) => {
    if (!roomCode) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    console.log(`Game started in room ${normalizedRoomCode}`);

    io.to(normalizedRoomCode).emit("game-started", {
      roomCode: normalizedRoomCode,
    });
  });

  // ==========================================
  // PLAYER POSITION
  // ==========================================

  socket.on("player-position", ({ roomCode, userId, x, y }) => {
    if (
      !roomCode ||
      !userId ||
      typeof x !== "number" ||
      typeof y !== "number"
    ) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    socket.to(normalizedRoomCode).emit("player-position", {
      userId,
      x,
      y,
    });
  });

  // ==========================================
  // PICK RAW MEAT
  // ==========================================

  socket.on("pick-meat", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    const state = getRoomState(normalizedRoomCode);

    // Only raw meat can be picked
    if (
      state.meat.state !== "available" ||
      state.meat.itemType !== "raw-meat"
    ) {
      return;
    }

    state.meat.state = "held";
    state.meat.userId = userId;

    state.meat.cookingStartedAt = null;
    state.meat.cookingDuration = 0;

    console.log(`${userId} picked raw meat in ${normalizedRoomCode}`);

    io.to(normalizedRoomCode).emit("meat-picked", {
      userId,
      itemType: "raw-meat",
    });
  });

  // ==========================================
  // DROP MEAT
  // ==========================================

  socket.on("drop-meat", ({ roomCode, userId, x, y }) => {
    if (!roomCode || !userId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    const state = getRoomState(normalizedRoomCode);

    // Only the player holding the meat
    // can drop it
    if (state.meat.state !== "held" || state.meat.userId !== userId) {
      return;
    }

    const itemType = state.meat.itemType;

    state.meat.state = "available";
    state.meat.userId = null;

    state.meat.x = typeof x === "number" ? x : state.meat.x;

    state.meat.y = typeof y === "number" ? y : state.meat.y;

    state.meat.cookingStartedAt = null;
    state.meat.cookingDuration = 0;

    console.log(`${userId} dropped ${itemType} in ${normalizedRoomCode}`);

    io.to(normalizedRoomCode).emit("meat-dropped", {
      userId,
      itemType,
      x: state.meat.x,
      y: state.meat.y,
    });
  });

  // ==========================================
  // START COOKING
  // ==========================================

  socket.on("start-cooking", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    const state = getRoomState(normalizedRoomCode);

    // Must be holding raw meat
    if (
      state.meat.state !== "held" ||
      state.meat.userId !== userId ||
      state.meat.itemType !== "raw-meat"
    ) {
      return;
    }

    const duration = 7000;

    state.meat.state = "cooking";
    state.meat.userId = null;

    // Grill position
    state.meat.x = 450;
    state.meat.y = 150;

    state.meat.cookingStartedAt = Date.now();

    state.meat.cookingDuration = duration;

    console.log(`${userId} started cooking in ${normalizedRoomCode}`);

    io.to(normalizedRoomCode).emit("cooking-started", {
      userId,
      duration,
    });

    setTimeout(() => {
      const currentState = getRoomState(normalizedRoomCode);

      // Only finish if still cooking
      if (
        currentState.meat.state !== "cooking" ||
        currentState.meat.cookingStartedAt === null
      ) {
        return;
      }

      currentState.meat.state = "cooked";

      currentState.meat.itemType = "cooked-meat";

      currentState.meat.userId = null;

      currentState.meat.x = 450;
      currentState.meat.y = 150;

      currentState.meat.cookingStartedAt = null;

      currentState.meat.cookingDuration = 0;

      console.log(`Cooking finished in ${normalizedRoomCode}`);

      io.to(normalizedRoomCode).emit("cooking-finished", {
        userId,
        x: currentState.meat.x,
        y: currentState.meat.y,
      });
    }, duration);
  });

  // ==========================================
  // PICK COOKED MEAT
  // ==========================================

  socket.on("pick-cooked-meat", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    const state = getRoomState(normalizedRoomCode);

    const isCooked =
      state.meat.itemType === "cooked-meat" &&
      (state.meat.state === "cooked" || state.meat.state === "available");

    if (!isCooked) {
      return;
    }

    state.meat.state = "held";

    state.meat.itemType = "cooked-meat";

    state.meat.userId = userId;

    state.meat.cookingStartedAt = null;

    state.meat.cookingDuration = 0;

    console.log(`${userId} picked cooked meat in ${normalizedRoomCode}`);

    io.to(normalizedRoomCode).emit("cooked-meat-picked", {
      userId,
      itemType: "cooked-meat",
    });
  });

  // ==========================================
  // DISCONNECT
  // ==========================================

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;

    const userId = socket.data.userId;

    console.log("Client disconnected:", socket.id);

    if (!roomCode || !userId) {
      return;
    }

    const state = getRoomState(roomCode);

    // If player disconnects while
    // holding the meat, release it.
    if (state.meat.state === "held" && state.meat.userId === userId) {
      const itemType = state.meat.itemType;

      state.meat.state = "available";

      state.meat.userId = null;

      if (itemType === "raw-meat") {
        state.meat.x = 160;
        state.meat.y = 150;
      } else {
        state.meat.x = 450;
        state.meat.y = 150;
      }

      console.log(`Released ${itemType} after disconnect in ${roomCode}`);

      emitState(roomCode);
    }
  });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
