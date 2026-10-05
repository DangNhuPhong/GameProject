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

    const gameRoom = getGameRoom(normalizedRoomCode);

    console.log(`User ${userId} joined room ${normalizedRoomCode}`);

    socket.emit("game-state", gameRoom.getState());

    socket.emit("room-joined", {
      roomCode: normalizedRoomCode,
      userId,
    });

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
      console.log("===== TAKE INGREDIENT RECEIVED =====");

      console.log({
        roomCode,
        userId,
        shelfId,
        playerX,
        playerY,
      });

      if (
        !roomCode ||
        !userId ||
        !shelfId ||
        typeof playerX !== "number" ||
        typeof playerY !== "number"
      ) {
        console.log("Invalid take-ingredient data");

        return;
      }

      const normalizedRoomCode = String(roomCode).toUpperCase();

      const gameRoom = getGameRoom(normalizedRoomCode);

      const shelf = gameRoom.getShelf(shelfId);

      if (!shelf) {
        console.log(`Shelf not found: ${shelfId}`);

        return;
      }

      const canTake = shelf.canTake(playerX, playerY, 90);

      if (!canTake) {
        console.log(`${userId} is too far from ${shelfId}`);

        return;
      }

      // Prevent player from creating
      // another item while already holding one.
      const alreadyHolding = gameRoom.items.some(
        (item) => item.state === "held" && item.userId === userId,
      );

      if (alreadyHolding) {
        console.log(`${userId} is already holding an item`);

        return;
      }

      const item = gameRoom.createItemFromShelf(shelfId, userId);

      if (!item) {
        console.log("Failed to create item");

        return;
      }

      console.log(`${userId} took ${item.type} (${item.id})`);

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
    },
  );

  // ==========================================
  // PICK UP DROPPED ITEM
  // ==========================================

  socket.on(
    "pick-up-item",
    ({ roomCode, userId, itemId, playerX, playerY }) => {
      console.log("===== PICK UP ITEM RECEIVED =====");

      console.log({
        roomCode,
        userId,
        itemId,
        playerX,
        playerY,
      });

      if (
        !roomCode ||
        !userId ||
        !itemId ||
        typeof playerX !== "number" ||
        typeof playerY !== "number"
      ) {
        console.log("Invalid pick-up-item data");

        return;
      }

      const normalizedRoomCode = String(roomCode).toUpperCase();

      const gameRoom = getGameRoom(normalizedRoomCode);

      // ==========================================
      // CHECK CURRENT PLAYER ALREADY HOLDS ITEM
      // ==========================================

      const alreadyHolding = gameRoom.items.some(
        (item) => item.state === "held" && item.userId === userId,
      );

      if (alreadyHolding) {
        console.log(`${userId} is already holding an item`);

        return;
      }

      // ==========================================
      // GET ITEM
      // ==========================================

      const item = gameRoom.getItem(itemId);

      if (!item) {
        console.log(`Item not found: ${itemId}`);

        return;
      }

      // ==========================================
      // ITEM MUST BE AVAILABLE
      // ==========================================

      if (item.state !== "available") {
        console.log(`Item ${itemId} is not available`);

        return;
      }

      // ==========================================
      // CHECK DISTANCE
      // ==========================================

      const distance = Math.sqrt(
        Math.pow(playerX - item.x, 2) + Math.pow(playerY - item.y, 2),
      );

      console.log("Distance to item:", distance);

      const PICKUP_RANGE = 60;

      if (distance > PICKUP_RANGE) {
        console.log(`${userId} is too far from item ${itemId}`);

        return;
      }

      // ==========================================
      // PICK ITEM
      // ==========================================

      const picked = item.pick(userId);

      if (!picked) {
        console.log(`Failed to pick item ${itemId}`);

        return;
      }

      console.log(`${userId} picked ${item.type} (${item.id})`);

      // ==========================================
      // BROADCAST
      // ==========================================

      io.to(normalizedRoomCode).emit("item-picked", {
        item: {
          id: item.id,
          type: item.type,
          state: item.state,
          x: item.x,
          y: item.y,
          userId: item.userId,
        },
      });
    },
  );

  // ==========================================
  // DROP ITEM
  // ==========================================

  socket.on("drop-item", ({ roomCode, userId, itemId, x, y }) => {
    console.log("===== DROP ITEM RECEIVED =====");

    console.log({
      roomCode,
      userId,
      itemId,
      x,
      y,
    });

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

    // Only the player holding
    // the item can drop it.
    if (item.state !== "held" || item.userId !== userId) {
      console.log(`${userId} cannot drop item ${itemId}`);

      return;
    }

    const dropX = typeof x === "number" ? x : item.x;

    const dropY = typeof y === "number" ? y : item.y;

    const dropped = item.drop(userId, dropX, dropY);

    if (!dropped) {
      console.log(`Failed to drop item ${itemId}`);

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

    // Release items held by
    // disconnected player.
    for (const item of gameRoom.items) {
      if (item.state === "held" && item.userId === userId) {
        item.state = "available";
        item.userId = null;

        console.log(`Released ${item.type} (${item.id}) after disconnect`);
      }
    }

    io.to(roomCode).emit("game-state", gameRoom.getState());
  });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
