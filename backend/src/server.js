import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import GameRoom from "./classes/GameRoom.js";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"],
  },
});

// ==========================================
// GAME ROOMS
// ==========================================

const gameRooms = {};

function getGameRoom(roomCode) {
  if (!gameRooms[roomCode]) {
    console.log(`Creating new GameRoom: ${roomCode}`);

    gameRooms[roomCode] = new GameRoom(roomCode);
  }

  return gameRooms[roomCode];
}

// ==========================================
// SOCKET CONNECTION
// ==========================================

io.on("connection", (socket) => {
  console.log("🔥 SOCKET CONNECTION:", socket.id);
  console.log("==========================================");
  console.log("Client connected:", socket.id);
  console.log("==========================================");

  // ==========================================
  // JOIN ROOM
  // ==========================================

  socket.on("join-room", ({ roomCode, userId }) => {
    if (!roomCode || !userId) {
      console.log("Invalid join-room data");
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    socket.join(normalizedRoomCode);

    socket.data.roomCode = normalizedRoomCode;

    socket.data.userId = userId;

    const gameRoom = getGameRoom(normalizedRoomCode);

    console.log(`User ${userId} joined room ${normalizedRoomCode}`);

    // Send current game state
    socket.emit("game-state", gameRoom.getState());

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
  // TAKE INGREDIENT FROM SHELF
  // ==========================================

  socket.on(
    "take-ingredient",
    ({ roomCode, userId, shelfId, playerX, playerY }) => {
      console.log("");
      console.log("==========================================");
      console.log("===== TAKE INGREDIENT RECEIVED =====");
      console.log("==========================================");

      console.log({
        roomCode,
        userId,
        shelfId,
        playerX,
        playerY,
      });

      // ==========================================
      // VALIDATE DATA
      // ==========================================

      if (
        !roomCode ||
        !userId ||
        !shelfId ||
        typeof playerX !== "number" ||
        typeof playerY !== "number"
      ) {
        console.log("INVALID TAKE INGREDIENT DATA");

        return;
      }

      const normalizedRoomCode = String(roomCode).toUpperCase();

      console.log("Normalized room:", normalizedRoomCode);

      // ==========================================
      // GET GAME ROOM
      // ==========================================

      const gameRoom = getGameRoom(normalizedRoomCode);

      console.log("Game room:", gameRoom.roomCode);

      // ==========================================
      // GET SHELF
      // ==========================================

      const shelf = gameRoom.getShelf(shelfId);

      console.log("Shelf:", shelf);

      if (!shelf) {
        console.log(`Shelf not found: ${shelfId}`);

        return;
      }

      // ==========================================
      // CHECK DISTANCE
      // ==========================================

      const canTake = shelf.canTake(playerX, playerY);

      console.log("Can take:", canTake);

      if (!canTake) {
        console.log(`${userId} is too far from ${shelfId}`);

        return;
      }

      // ==========================================
      // CREATE ITEM
      // ==========================================

      console.log("Creating item from shelf...");

      const item = gameRoom.createItemFromShelf(shelfId, userId);

      console.log("Created item:", item);

      if (!item) {
        console.log("FAILED TO CREATE ITEM");

        return;
      }

      // ==========================================
      // ITEM CREATED
      // ==========================================

      console.log(`${userId} took ${item.type} (${item.id})`);

      // ==========================================
      // SEND ITEM TO ALL PLAYERS
      // ==========================================

      io.to(normalizedRoomCode).emit("item-created", {
        item: {
          id: item.id,
          type: item.type,
          state: item.state,
          x: item.x,
          y: item.y,
          userId: item.userId,
        },
      });

      console.log("item-created event emitted");

      console.log("==========================================");
      console.log("");
    },
  );

  // ==========================================
  // DROP ITEM
  // ==========================================

  socket.on("drop-item", ({ roomCode, userId, itemId, x, y }) => {
    if (!roomCode || !userId || !itemId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    const gameRoom = getGameRoom(normalizedRoomCode);

    const item = gameRoom.getItem(itemId);

    if (!item) {
      console.log(`Item not found: ${itemId}`);

      return;
    }

    const dropped = item.drop(
      userId,

      typeof x === "number" ? x : item.x,

      typeof y === "number" ? y : item.y,
    );

    if (!dropped) {
      console.log(`Failed to drop item: ${itemId}`);

      return;
    }

    console.log(`${userId} dropped ${item.type} (${item.id})`);

    io.to(normalizedRoomCode).emit("item-dropped", {
      item: {
        id: item.id,
        type: item.type,
        state: item.state,
        x: item.x,
        y: item.y,
        userId: item.userId,
      },
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

    const gameRoom = getGameRoom(roomCode);

    // ==========================================
    // RELEASE HELD ITEMS
    // ==========================================

    for (const item of gameRoom.items) {
      if (item.state === "held" && item.userId === userId) {
        item.state = "available";
        item.userId = null;

        console.log(`Released ${item.type} (${item.id}) after disconnect`);
      }
    }

    // ==========================================
    // SEND UPDATED STATE
    // ==========================================

    io.to(roomCode).emit("game-state", gameRoom.getState());
  });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
