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

/*
  Game state theo room

  roomStates = {
    ABC123: {
      meat: {
        state:
          "available"
          "held"
          "cooking"
          "cooked",

        itemType:
          "raw-meat"
          "cooked-meat",

        userId: null,

        x: 160,
        y: 150
      }
    }
  }
*/

const roomStates = {};

function getRoomState(roomCode) {
  if (!roomStates[roomCode]) {
    roomStates[roomCode] = {
      meat: {
        state: "available",
        itemType: "raw-meat",
        userId: null,
        x: 160,
        y: 150,
      },
    };
  }

  return roomStates[roomCode];
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // ==========================================
  // JOIN ROOM
  // ==========================================

  socket.on("join-room", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    socket.join(roomCode);

    socket.data.roomCode = roomCode;
    socket.data.userId = userId;

    const state = getRoomState(roomCode);

    console.log(`User ${userId} joined room ${roomCode}`);

    // Gửi state hiện tại
    socket.emit("game-state", state);

    socket.emit("room-joined", {
      roomCode,
      userId,
    });

    socket.to(roomCode).emit("player-joined", {
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

    console.log(`User ${userId} ready = ${ready}`);

    io.to(roomCode).emit("player-ready", {
      userId,
      ready,
    });
  });

  // ==========================================
  // GAME STARTED
  // ==========================================

  socket.on("game-started", ({ roomCode }) => {
    if (!roomCode) {
      return;
    }

    console.log(`Game started in room ${roomCode}`);

    io.to(roomCode).emit("game-started", {
      roomCode,
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

    socket.to(roomCode).emit("player-position", {
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

    const state = getRoomState(roomCode);

    // Chỉ pick raw meat
    if (
      state.meat.state !== "available" ||
      state.meat.itemType !== "raw-meat"
    ) {
      return;
    }

    state.meat.state = "held";

    state.meat.userId = userId;

    console.log(`${userId} picked raw meat in ${roomCode}`);

    io.to(roomCode).emit("meat-picked", {
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

    const state = getRoomState(roomCode);

    // Người drop phải là người
    // đang giữ meat
    if (state.meat.state !== "held" || state.meat.userId !== userId) {
      return;
    }

    /*
        QUAN TRỌNG:

        Không reset itemType.

        Nếu đang cầm raw-meat:
          raw-meat -> available

        Nếu đang cầm cooked-meat:
          cooked-meat -> available
      */

    const itemType = state.meat.itemType;

    state.meat.state = "available";

    state.meat.userId = null;

    state.meat.x = typeof x === "number" ? x : state.meat.x;

    state.meat.y = typeof y === "number" ? y : state.meat.y;

    console.log(`${userId} dropped ${itemType} in ${roomCode}`);

    io.to(roomCode).emit("meat-dropped", {
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

    const state = getRoomState(roomCode);

    // Phải đang cầm raw meat
    if (
      state.meat.state !== "held" ||
      state.meat.userId !== userId ||
      state.meat.itemType !== "raw-meat"
    ) {
      return;
    }

    state.meat.state = "cooking";

    state.meat.userId = null;

    console.log(`${userId} started cooking`);

    io.to(roomCode).emit("cooking-started", {
      userId,
      duration: 7000,
    });

    setTimeout(() => {
      const currentState = getRoomState(roomCode);

      // Chỉ finish nếu vẫn cooking
      if (currentState.meat.state === "cooking") {
        currentState.meat.state = "cooked";

        currentState.meat.itemType = "cooked-meat";

        currentState.meat.userId = null;

        console.log(`Cooking finished in ${roomCode}`);

        io.to(roomCode).emit("cooking-finished", {
          userId,
        });
      }
    }, 7000);
  });

  // ==========================================
  // PICK COOKED MEAT
  // ==========================================

  socket.on("pick-cooked-meat", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      return;
    }

    const state = getRoomState(roomCode);

    // Phải là cooked meat
    if (
      state.meat.state !== "cooked" &&
      !(
        state.meat.state === "available" &&
        state.meat.itemType === "cooked-meat"
      )
    ) {
      return;
    }

    state.meat.state = "held";

    state.meat.itemType = "cooked-meat";

    state.meat.userId = userId;

    console.log(`${userId} picked cooked meat`);

    io.to(roomCode).emit("cooked-meat-picked", {
      userId,
      itemType: "cooked-meat",
    });
  });

  // ==========================================
  // DISCONNECT
  // ==========================================

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
