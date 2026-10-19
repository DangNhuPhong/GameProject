import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import GameRoom from "./classes/GameRoom.js";

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
// GAME ROOMS
// ==========================================

const gameRooms = {};

function getGameRoom(roomCode, mapId) {
  let room = gameRooms[roomCode];

  // Phòng tạo từ lobby với map mặc định, chưa chơi gì -> tạo lại đúng map
  if (
    room &&
    mapId &&
    room.mapId !== mapId &&
    room.items.length === 0 &&
    room.score === 0
  ) {
    console.log(`Recreating room ${roomCode}: ${room.mapId} -> ${mapId}`);
    room = null;
  }

  if (!room) {
    if (!mapId)
      console.warn(`Room ${roomCode} created WITHOUT mapId -> default map`);
    console.log(
      `Creating new GameRoom: ${roomCode} (map: ${mapId || "default"})`,
    );
    room = gameRooms[roomCode] = new GameRoom(roomCode, mapId || undefined);
  }

  return room;
}

// ==========================================
// PLAYER POSITIONS
// Server lưu vị trí mới nhất của từng người chơi
// để các trạm (thớt thái...) kiểm tra khoảng cách.
// key = "ROOMCODE:userId"
// ==========================================

const playerPositions = new Map();

function positionKey(roomCode, userId) {
  return `${roomCode}:${userId}`;
}

// ==========================================
// SOCKET CONNECTION
// ==========================================

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

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
    if (!roomCode || !userId) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    socket.join(normalizedRoomCode);

    socket.data.roomCode = normalizedRoomCode;

    socket.data.userId = userId;

    const gameRoom = getGameRoom(normalizedRoomCode, mapId);

    console.log(`User ${userId} joined room ${normalizedRoomCode}`);

    socket.emit("game-state", gameRoom.getState());

    // Danh sách đơn + điểm hiện tại cho người mới vào
    socket.emit("orders-updated", {
      orders: gameRoom.getOrders(),
      score: gameRoom.score,
    });

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

  handle("player-ready", ({ roomCode, userId, ready }) => {
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

  handle("game-started", ({ roomCode }) => {
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

  handle("player-position", ({ roomCode, userId, x, y, t }) => {
    if (
      !roomCode ||
      !userId ||
      typeof x !== "number" ||
      typeof y !== "number"
    ) {
      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    // Lưu vị trí để server kiểm tra khoảng cách (thớt thái...)
    playerPositions.set(positionKey(normalizedRoomCode, userId), { x, y });

    // volatile: gói cũ bị bỏ nếu client chưa kịp nhận, tránh dồn cục
    socket.to(normalizedRoomCode).volatile.emit("player-position", {
      userId,
      x,
      y,
      t: typeof t === "number" ? t : Date.now(),
    });
  });

  // ==========================================
  // TAKE INGREDIENT FROM SHELF
  // ==========================================

  handle(
    "take-ingredient",
    ({ roomCode, userId, shelfId, playerX, playerY }) => {
      console.log("===== TAKE INGREDIENT RECEIVED =====");

      console.log({ roomCode, userId, shelfId, playerX, playerY });

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

      const canTake = shelf.canTake(playerX, playerY, 1000);

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
        item: item.serialize(),
      });
    },
  );

  // ==========================================
  // TAKE PLATE FROM PLATE STATION
  // ==========================================

  handle("take-plate", ({ roomCode, userId, playerX, playerY }) => {
    console.log("===== TAKE PLATE RECEIVED =====");

    console.log({ roomCode, userId, playerX, playerY });

    if (
      !roomCode ||
      !userId ||
      typeof playerX !== "number" ||
      typeof playerY !== "number"
    ) {
      console.log("Invalid take-plate data");

      return;
    }

    const normalizedRoomCode = String(roomCode).toUpperCase();

    const gameRoom = getGameRoom(normalizedRoomCode);

    // CHECK DISTANCE
    const plateStation = gameRoom.plateStation;

    const distance = Math.sqrt(
      Math.pow(playerX - plateStation.x, 2) +
        Math.pow(playerY - plateStation.y, 2),
    );

    console.log("Distance to plate station:", distance);

    const PLATE_RANGE = 90;

    if (distance > PLATE_RANGE) {
      console.log(`${userId} is too far from plate station`);

      return;
    }

    // PLAYER CAN ONLY HOLD ONE ITEM
    const alreadyHolding = gameRoom.items.some(
      (item) => item.state === "held" && item.userId === userId,
    );

    if (alreadyHolding) {
      console.log(`${userId} is already holding an item`);

      return;
    }

    // CREATE PLATE
    const plate = gameRoom.createPlate(userId);

    if (!plate) {
      console.log("Failed to create plate");

      return;
    }

    console.log(`${userId} took plate (${plate.id})`);

    io.to(normalizedRoomCode).emit("item-created", {
      item: plate.serialize(),
    });
  });

  // ==========================================
  // PICK UP DROPPED ITEM
  // ==========================================

  handle("pick-up-item", ({ roomCode, userId, itemId, playerX, playerY }) => {
    console.log("===== PICK UP ITEM RECEIVED =====");

    console.log({ roomCode, userId, itemId, playerX, playerY });

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

    // CHECK CURRENT PLAYER ALREADY HOLDS ITEM
    const alreadyHolding = gameRoom.items.some(
      (item) => item.state === "held" && item.userId === userId,
    );

    if (alreadyHolding) {
      console.log(`${userId} is already holding an item`);

      return;
    }

    // GET ITEM
    const item = gameRoom.getItem(itemId);

    if (!item) {
      console.log(`Item not found: ${itemId}`);

      return;
    }

    // ITEM MUST BE AVAILABLE
    if (item.state !== "available") {
      console.log(`Item ${itemId} is not available`);

      return;
    }

    // CHECK DISTANCE
    const distance = Math.sqrt(
      Math.pow(playerX - item.x, 2) + Math.pow(playerY - item.y, 2),
    );

    console.log("Distance to item:", distance);

    const PICKUP_RANGE = 60;

    if (distance > PICKUP_RANGE) {
      console.log(`${userId} is too far from item ${itemId}`);

      return;
    }

    // PICK ITEM
    const picked = item.pick(userId);

    if (!picked) {
      console.log(`Failed to pick item ${itemId}`);

      return;
    }

    console.log(`${userId} picked ${item.type} (${item.id})`);

    io.to(normalizedRoomCode).emit("item-picked", {
      item: item.serialize(),
    });
  });

  // ==========================================
  // DROP ITEM
  // ==========================================

  handle("drop-item", ({ roomCode, userId, itemId, x, y }) => {
    console.log("===== DROP ITEM RECEIVED =====");

    console.log({ roomCode, userId, itemId, x, y });

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

    // Only the player holding the item can drop it.
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
      item: item.serialize(),
    });
  });

  handle("use-trash-bin", ({ roomCode, userId, itemId, playerX, playerY }) => {
    if (!roomCode || !userId || !itemId) return;

    const code = String(roomCode).toUpperCase();
    const gameRoom = getGameRoom(code);

    if (!nearSpecialStation(gameRoom, "trash-bin", playerX, playerY)) {
      socket.emit("interaction-error", {
        message: "Too far from trash bin",
      });
      return;
    }

    const item = gameRoom.getItem(itemId);

    if (!item || item.state !== "held" || item.userId !== userId) {
      socket.emit("interaction-error", {
        message: "You are not holding that item",
      });
      return;
    }

    gameRoom.removeItem(itemId);

    io.to(code).emit("item-removed", { itemId, userId });
  });

  handle("request-orders", ({ roomCode, playerX, playerY }) => {
    if (!roomCode) return;

    const code = String(roomCode).toUpperCase();
    const gameRoom = getGameRoom(code);

    if (!nearSpecialStation(gameRoom, "order-station", playerX, playerY)) {
      socket.emit("interaction-error", {
        message: "Too far from order station",
      });
      return;
    }

    // Chỉ gửi cho người đang bấm E để mở bảng đơn hàng
    socket.emit("orders-list", {
      orders: gameRoom.getOrders(),
      score: gameRoom.score,
    });
  });

  handle("serve-order", ({ roomCode, userId, itemId, playerX, playerY }) => {
    if (!roomCode || !userId || !itemId) return;

    const code = String(roomCode).toUpperCase();
    const gameRoom = getGameRoom(code);

    if (!nearSpecialStation(gameRoom, "serving-counter", playerX, playerY)) {
      socket.emit("interaction-error", {
        message: "Too far from serving counter",
      });
      return;
    }

    const plate = gameRoom.getItem(itemId);

    if (
      !plate ||
      plate.type !== "plate" ||
      plate.state !== "held" ||
      plate.userId !== userId
    ) {
      socket.emit("interaction-error", {
        message: "Hold a prepared plate to serve",
      });
      return;
    }

    const result = gameRoom.submitPlate(plate);

    if (!result.success) {
      socket.emit("interaction-error", {
        message: result.message,
      });
      return;
    }

    io.to(code).emit("item-removed", {
      itemId,
      userId,
    });

    io.to(code).emit("order-completed", {
      order: result.order,
      recipeId: result.recipeId,
      userId,
      points: result.points,
      score: result.score,
    });

    io.to(code).emit("orders-updated", {
      orders: gameRoom.getOrders(),
    });
  });

  // Tìm trạm đặc biệt theo "kind" (trash-bin, order-station, serving-counter)
  // hoặc theo id. Có nhiều trạm cùng loại thì xét cái gần nhất.
  function nearSpecialStation(gameRoom, kindOrId, x, y, range = 28) {
    if (typeof x !== "number" || typeof y !== "number") {
      return false;
    }

    return gameRoom.specialStations.some(
      (s) =>
        (s.kind === kindOrId || s.id === kindOrId) &&
        Math.hypot(x - s.x, y - s.y) <= range,
    );
  }

  // ==========================================
  // PLACE ITEM ON STATION (Grill, Cutting...)
  // ==========================================

  handle(
    "place-on-station",
    ({ roomCode, userId, stationId, itemId, playerX, playerY }) => {
      if (
        !roomCode ||
        !userId ||
        !stationId ||
        !itemId ||
        typeof playerX !== "number" ||
        typeof playerY !== "number"
      ) {
        return;
      }

      const normalizedRoomCode = String(roomCode).toUpperCase();

      const gameRoom = getGameRoom(normalizedRoomCode);

      const station = gameRoom.getStation(stationId);

      if (!station) {
        console.log(`Station not found: ${stationId}`);

        return;
      }

      if (!station.canUse(playerX, playerY)) {
        console.log(`${userId} is too far from ${stationId}`);

        return;
      }

      const item = gameRoom.getItem(itemId);

      // Chỉ người đang cầm item mới đặt được
      if (!item || item.state !== "held" || item.userId !== userId) {
        console.log(`${userId} is not holding item ${itemId}`);

        return;
      }

      if (!station.placeItem(item)) {
        console.log(`Station ${stationId} cannot accept ${item.type}`);

        return;
      }

      console.log(`${userId} placed ${item.type} on ${stationId}`);

      io.to(normalizedRoomCode).emit("station-updated", {
        station: station.getState(),
        item: item.serialize(),
      });
    },
  );

  // ==========================================
  // TAKE ITEM FROM STATION
  // ==========================================

  handle(
    "take-from-station",
    ({ roomCode, userId, stationId, playerX, playerY }) => {
      if (
        !roomCode ||
        !userId ||
        !stationId ||
        typeof playerX !== "number" ||
        typeof playerY !== "number"
      ) {
        return;
      }

      const normalizedRoomCode = String(roomCode).toUpperCase();

      const gameRoom = getGameRoom(normalizedRoomCode);

      const station = gameRoom.getStation(stationId);

      if (!station || !station.hasItem()) {
        return;
      }

      if (!station.canUse(playerX, playerY)) {
        console.log(`${userId} is too far from ${stationId}`);

        return;
      }

      const alreadyHolding = gameRoom.items.some(
        (item) => item.state === "held" && item.userId === userId,
      );

      if (alreadyHolding) {
        console.log(`${userId} is already holding an item`);

        return;
      }

      const item = station.takeItem(userId);

      if (!item) {
        return;
      }

      console.log(
        `${userId} took ${item.type} (${item.status}) from ${stationId}`,
      );

      io.to(normalizedRoomCode).emit("station-updated", {
        station: station.getState(),
        item: item.serialize(),
      });
    },
  );

  // ==========================================
  // START / RESUME CUTTING (bấm E)
  // ==========================================

  handle(
    "start-cutting",
    ({ roomCode, userId, stationId, playerX, playerY }) => {
      if (
        !roomCode ||
        !userId ||
        !stationId ||
        typeof playerX !== "number" ||
        typeof playerY !== "number"
      ) {
        return;
      }

      const normalizedRoomCode = String(roomCode).toUpperCase();

      const gameRoom = getGameRoom(normalizedRoomCode);

      const station = gameRoom.getStation(stationId);

      if (!station || station.type !== "cutting") {
        return;
      }

      // Cập nhật vị trí mới nhất để tick không pause nhầm
      playerPositions.set(positionKey(normalizedRoomCode, userId), {
        x: playerX,
        y: playerY,
      });

      if (!station.startCutting(userId, playerX, playerY)) {
        console.log(`${userId} cannot start cutting at ${stationId}`);

        return;
      }

      console.log(`${userId} started cutting at ${stationId}`);

      io.to(normalizedRoomCode).emit("station-updated", {
        station: station.getState(),
        item: station.item ? station.item.serialize() : null,
      });
    },
  );

  // ==========================================
  // ADD INGREDIENT TO PLATE
  // ==========================================

  handle(
    "add-ingredient-to-plate",
    ({ roomCode, userId, plateId, itemId, playerX, playerY }) => {
      console.log("Received add-ingredient-to-plate:", {
        roomCode,
        userId,
        plateId,
        itemId,
        playerX,
        playerY,
      });

      if (
        !roomCode ||
        !userId ||
        !plateId ||
        !itemId ||
        typeof playerX !== "number" ||
        typeof playerY !== "number"
      ) {
        return;
      }

      const normalizedRoomCode = String(roomCode).toUpperCase();

      // Socket phải thuộc đúng phòng và người chơi
      if (
        socket.data.roomCode !== normalizedRoomCode ||
        socket.data.userId !== userId
      ) {
        return;
      }

      const gameRoom = getGameRoom(normalizedRoomCode);
      const plate = gameRoom.getItem(plateId);

      if (!plate || plate.type !== "plate") {
        socket.emit("interaction-error", {
          message: "Plate not found",
        });
        return;
      }

      // Kiểm tra khoảng cách tới đĩa
      const distance = Math.sqrt(
        Math.pow(playerX - plate.x, 2) + Math.pow(playerY - plate.y, 2),
      );

      const PLATE_RANGE = 90;

      if (distance > PLATE_RANGE) {
        socket.emit("interaction-error", {
          message: "Too far from plate",
        });
        return;
      }

      // GameRoom kiểm tra người cầm item và thêm nguyên liệu
      const result = gameRoom.addIngredientToPlate(plateId, itemId, userId);

      if (!result || !result.success) {
        socket.emit("interaction-error", {
          message: result?.message || "Cannot add ingredient to plate",
        });
        return;
      }

      console.log(`${userId} added ${itemId} to plate ${plateId}`);

      // Đồng bộ toàn bộ trạng thái phòng:
      // - nguyên liệu riêng đã bị xóa
      // - đĩa có ingredients mới
      io.to(normalizedRoomCode).emit("game-state", gameRoom.getState());
    },
  );

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

    try {
      const gameRoom = getGameRoom(roomCode);

      // Xóa vị trí -> thớt đang được người này thái sẽ tạm dừng
      playerPositions.delete(positionKey(roomCode, userId));

      // Báo cho người còn lại xoá nhân vật này (nếu không sẽ thành "bóng ma" chặn đường)
      socket.to(roomCode).emit("player-left", { userId });

      // Release items held by disconnected player.
      for (const item of gameRoom.items) {
        if (item.state === "held" && item.userId === userId) {
          item.state = "available";
          item.userId = null;

          console.log(`Released ${item.type} (${item.id}) after disconnect`);
        }
      }

      io.to(roomCode).emit("game-state", gameRoom.getState());
    } catch (err) {
      console.error('Error in "disconnect":', err);
    }
  });
});

// ==========================================
// STATION TICK (nướng chín / cháy / thái...)
// ==========================================

setInterval(() => {
  try {
    for (const gameRoom of Object.values(gameRooms)) {
      const changedStations = gameRoom.update(
        (userId) =>
          playerPositions.get(positionKey(gameRoom.roomCode, userId)) ?? null,
      );

      for (const station of changedStations) {
        io.to(gameRoom.roomCode).emit("station-updated", {
          station: station.getState(),
          item: station.item ? station.item.serialize() : null,
        });
      }

      // Đơn hàng: sinh đơn ngẫu nhiên theo thời gian, bỏ đơn hết hạn
      const before = gameRoom.orders.map((o) => o.id).join(",");

      gameRoom.updateOrders();

      const after = gameRoom.orders.map((o) => o.id).join(",");

      if (before !== after) {
        io.to(gameRoom.roomCode).emit("orders-updated", {
          orders: gameRoom.getOrders(),
          score: gameRoom.score,
        });
      }
    }
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
