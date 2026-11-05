import GameRoom from "./GameRoom.js";

// =====================================================================
// GAME CONTROLLER (dùng chung cho server và trình duyệt)
//
// Chứa TOÀN BỘ luật xử lý hành động của người chơi (nhặt đồ, đặt lên trạm,
// thái, nướng, bỏ vào đĩa, phục vụ...). Không biết gì về socket hay Phaser.
//
// File này GIỐNG HỆT NHAU ở:
//   backend/src/classes/GameController.js
//   frontend/src/game/core/GameController.js
// Sửa luật game thì sửa ở một nơi rồi chép sang nơi kia.
//
// Cách dùng:
//   const controller = new GameController({ getLayout: (mapId) => layout });
//   controller.handle("take-plate", payload, ctx);
//   setInterval(() => controller.tick(toRoom), 200);
//
// ctx (do bên gọi cung cấp):
//   toRoom(roomCode, event, data)  -> gửi cho mọi người trong phòng
//   toSender(event, data)          -> gửi riêng cho người vừa gửi lệnh
//   toOthers(roomCode, event, data)-> gửi cho mọi người TRỪ người gửi (có thể bỏ)
//   toOthersVolatile(...)          -> như trên nhưng được phép rơi gói (có thể bỏ)
//   verify(roomCode, userId)       -> true nếu socket này đúng là userId đó (có thể bỏ)
// =====================================================================

const PICKUP_RANGE = 60;
const PLATE_RANGE = 90;
const HELD_PLATE_RANGE = 30; // client dùng 20, chừa dung sai
const SPECIAL_RANGE = 28;

const code = (roomCode) => String(roomCode).toUpperCase();
const isNum = (n) => typeof n === "number";

export default class GameController {
  constructor({ getLayout }) {
    this.getLayout = getLayout;

    this.rooms = {};

    // Vị trí mới nhất của từng người chơi: key = "ROOM:userId"
    // (thớt thái dùng để biết người thái có còn đứng gần không)
    this.positions = new Map();

    this.handlers = {
      "take-ingredient": (p, ctx) => this.takeIngredient(p, ctx),
      "take-plate": (p, ctx) => this.takePlate(p, ctx),
      "pick-up-item": (p, ctx) => this.pickUpItem(p, ctx),
      "drop-item": (p, ctx) => this.dropItem(p, ctx),
      "use-trash-bin": (p, ctx) => this.useTrashBin(p, ctx),
      "request-orders": (p, ctx) => this.requestOrders(p, ctx),
      "serve-order": (p, ctx) => this.serveOrder(p, ctx),
      "place-on-station": (p, ctx) => this.placeOnStation(p, ctx),
      "take-from-station": (p, ctx) => this.takeFromStation(p, ctx),
      "start-cutting": (p, ctx) => this.startCutting(p, ctx),
      "add-ingredient-to-plate": (p, ctx) => this.addIngredientToPlate(p, ctx),
      "add-to-held-plate": (p, ctx) => this.addToHeldPlate(p, ctx),
      "player-position": (p, ctx) => this.playerPosition(p, ctx),
    };
  }

  // ===================================================================
  // ROOM
  // ===================================================================

  getRoom(roomCode, mapId) {
    const key = code(roomCode);
    let room = this.rooms[key];

    // Phòng tạo từ lobby với map mặc định, chưa chơi gì -> tạo lại đúng map
    if (
      room &&
      mapId &&
      room.mapId !== mapId &&
      room.items.length === 0 &&
      room.score === 0
    ) {
      room = null;
    }

    if (!room) {
      room = this.rooms[key] = new GameRoom(key, this.getLayout(mapId));
    }

    return room;
  }

  removeRoom(roomCode) {
    delete this.rooms[code(roomCode)];
  }

  // Có xử lý event này không?
  has(eventName) {
    return Boolean(this.handlers[eventName]);
  }

  handle(eventName, payload, ctx) {
    const fn = this.handlers[eventName];
    if (fn) fn(payload || {}, ctx);
  }

  positionKey(roomCode, userId) {
    return `${code(roomCode)}:${userId}`;
  }

  holdingItem(room, userId) {
    return room.items.some(
      (item) => item.state === "held" && item.userId === userId,
    );
  }

  // Có trạm đặc biệt (trash-bin, order-station, serving-counter) trong tầm không
  nearSpecialStation(room, kind, x, y, range = SPECIAL_RANGE) {
    if (!isNum(x) || !isNum(y)) return false;

    return room.specialStations.some(
      (s) =>
        (s.kind === kind || s.id === kind) &&
        Math.hypot(x - s.x, y - s.y) <= range,
    );
  }

  // ===================================================================
  // JOIN / LEAVE
  // ===================================================================

  join({ roomCode, userId, mapId }, ctx) {
    if (!roomCode || !userId) return null;

    const room = this.getRoom(roomCode, mapId);

    ctx.toSender("game-state", room.getState());

    ctx.toSender("orders-updated", {
      orders: room.getOrders(),
      score: room.score,
    });

    ctx.toSender("room-joined", { roomCode: code(roomCode), userId });

    ctx.toOthers?.(code(roomCode), "player-joined", { userId });

    return room;
  }

  leave(roomCode, userId, ctx) {
    if (!roomCode || !userId) return;

    const key = code(roomCode);
    const room = this.rooms[key];

    // Xoá vị trí -> thớt người này đang thái sẽ tạm dừng
    this.positions.delete(this.positionKey(key, userId));

    // Báo cho người còn lại xoá nhân vật này
    ctx.toOthers?.(key, "player-left", { userId });

    if (!room) return;

    // Trả lại đồ người này đang cầm
    for (const item of room.items) {
      if (item.state === "held" && item.userId === userId) {
        item.state = "available";
        item.userId = null;
      }
    }

    ctx.toRoom(key, "game-state", room.getState());
  }

  // ===================================================================
  // POSITION
  // ===================================================================

  playerPosition({ roomCode, userId, x, y, t }, ctx) {
    if (!roomCode || !userId || !isNum(x) || !isNum(y)) return;

    const key = code(roomCode);

    this.positions.set(this.positionKey(key, userId), { x, y });

    const room = this.rooms[key];

    if (room) {
      for (const station of room.stations) {
        if (
          station.type !== "cutting" ||
          station.cutState !== "cutting" ||
          station.cuttingUserId !== userId ||
          !station.cutAnchor
        ) {
          continue;
        }

        const moved = Math.hypot(
          x - station.cutAnchor.x,
          y - station.cutAnchor.y,
        );

        if (moved > 1.5 && station.pauseCutting(userId)) {
          ctx.toRoom(key, "station-updated", {
            station: station.getState(),
            item: station.item ? station.item.serialize() : null,
          });
        }
      }
    }

    ctx.toOthersVolatile?.(key, "player-position", {
      userId,
      x,
      y,
      t: isNum(t) ? t : Date.now(),
    });
  }

  // ===================================================================
  // TAKE INGREDIENT FROM SHELF
  // ===================================================================

  takeIngredient({ roomCode, userId, shelfId, playerX, playerY }, ctx) {
    if (!roomCode || !userId || !shelfId || !isNum(playerX) || !isNum(playerY))
      return;

    const key = code(roomCode);
    const room = this.getRoom(key);
    const shelf = room.getShelf(shelfId);

    if (!shelf) return;
    if (!shelf.canTake(playerX, playerY, 1000)) return;
    if (this.holdingItem(room, userId)) return;

    const item = room.createItemFromShelf(shelfId, userId);
    if (!item) return;

    ctx.toRoom(key, "item-created", { item: item.serialize() });
  }

  // ===================================================================
  // TAKE PLATE
  // ===================================================================

  takePlate({ roomCode, userId, playerX, playerY }, ctx) {
    if (!roomCode || !userId || !isNum(playerX) || !isNum(playerY)) return;

    const key = code(roomCode);
    const room = this.getRoom(key);
    const ps = room.plateStation;

    if (!ps) return;

    if (Math.hypot(playerX - ps.x, playerY - ps.y) > PLATE_RANGE) return;
    if (this.holdingItem(room, userId)) return;

    const plate = room.createPlate(userId);
    if (!plate) return;

    ctx.toRoom(key, "item-created", { item: plate.serialize() });
  }

  // ===================================================================
  // PICK UP / DROP
  // ===================================================================

  pickUpItem({ roomCode, userId, itemId, playerX, playerY }, ctx) {
    if (!roomCode || !userId || !itemId || !isNum(playerX) || !isNum(playerY))
      return;

    const key = code(roomCode);
    const room = this.getRoom(key);

    if (this.holdingItem(room, userId)) return;

    const item = room.getItem(itemId);

    if (!item || item.state !== "available") return;

    if (Math.hypot(playerX - item.x, playerY - item.y) > PICKUP_RANGE) return;

    if (!item.pick(userId)) return;

    ctx.toRoom(key, "item-picked", { item: item.serialize() });
  }

  dropItem({ roomCode, userId, itemId, x, y }, ctx) {
    if (!roomCode || !userId || !itemId) return;

    const key = code(roomCode);
    const room = this.getRoom(key);
    const item = room.getItem(itemId);

    if (!item) return;
    if (item.state !== "held" || item.userId !== userId) return;

    const dropX = isNum(x) ? x : item.x;
    const dropY = isNum(y) ? y : item.y;

    if (!item.drop(userId, dropX, dropY)) return;

    ctx.toRoom(key, "item-dropped", { item: item.serialize() });
  }

  // ===================================================================
  // TRASH / ORDERS / SERVE
  // ===================================================================

  useTrashBin({ roomCode, userId, itemId, playerX, playerY }, ctx) {
    if (!roomCode || !userId || !itemId) return;

    const key = code(roomCode);
    const room = this.getRoom(key);

    if (!this.nearSpecialStation(room, "trash-bin", playerX, playerY)) {
      ctx.toSender("interaction-error", { message: "Too far from trash bin" });
      return;
    }

    const item = room.getItem(itemId);

    if (!item || item.state !== "held" || item.userId !== userId) {
      ctx.toSender("interaction-error", {
        message: "You are not holding that item",
      });
      return;
    }

    room.removeItem(itemId);

    ctx.toRoom(key, "item-removed", { itemId, userId });
  }

  requestOrders({ roomCode, playerX, playerY }, ctx) {
    if (!roomCode) return;

    const room = this.getRoom(code(roomCode));

    if (!this.nearSpecialStation(room, "order-station", playerX, playerY)) {
      ctx.toSender("interaction-error", {
        message: "Too far from order station",
      });
      return;
    }

    // Chỉ gửi cho người đang bấm E để mở bảng đơn hàng
    ctx.toSender("orders-list", {
      orders: room.getOrders(),
      score: room.score,
    });
  }

  serveOrder({ roomCode, userId, itemId, playerX, playerY }, ctx) {
    if (!roomCode || !userId || !itemId) return;

    const key = code(roomCode);
    const room = this.getRoom(key);

    if (!this.nearSpecialStation(room, "serving-counter", playerX, playerY)) {
      ctx.toSender("interaction-error", {
        message: "Too far from serving counter",
      });
      return;
    }

    const plate = room.getItem(itemId);

    if (
      !plate ||
      plate.type !== "plate" ||
      plate.state !== "held" ||
      plate.userId !== userId
    ) {
      ctx.toSender("interaction-error", {
        message: "Hold a prepared plate to serve",
      });
      return;
    }

    const result = room.submitPlate(plate);

    if (!result.success) {
      ctx.toSender("interaction-error", { message: result.message });
      return;
    }

    ctx.toRoom(key, "item-removed", { itemId, userId });

    ctx.toRoom(key, "order-completed", {
      order: result.order,
      recipeId: result.recipeId,
      userId,
      points: result.points,
      score: result.score,
    });

    ctx.toRoom(key, "orders-updated", {
      orders: room.getOrders(),
      score: room.score,
    });
  }

  // ===================================================================
  // STATIONS
  // ===================================================================

  placeOnStation(
    { roomCode, userId, stationId, itemId, playerX, playerY },
    ctx,
  ) {
    if (
      !roomCode ||
      !userId ||
      !stationId ||
      !itemId ||
      !isNum(playerX) ||
      !isNum(playerY)
    )
      return;

    const key = code(roomCode);
    const room = this.getRoom(key);
    const station = room.getStation(stationId);

    if (!station) return;
    if (!station.canUse(playerX, playerY)) return;

    const item = room.getItem(itemId);

    // Chỉ người đang cầm item mới đặt được
    if (!item || item.state !== "held" || item.userId !== userId) return;

    if (!station.placeItem(item)) return;

    ctx.toRoom(key, "station-updated", {
      station: station.getState(),
      item: item.serialize(),
    });
  }

  takeFromStation({ roomCode, userId, stationId, playerX, playerY }, ctx) {
    if (
      !roomCode ||
      !userId ||
      !stationId ||
      !isNum(playerX) ||
      !isNum(playerY)
    )
      return;

    const key = code(roomCode);
    const room = this.getRoom(key);
    const station = room.getStation(stationId);

    if (!station || !station.hasItem()) return;
    if (!station.canUse(playerX, playerY)) return;
    if (this.holdingItem(room, userId)) return;

    const item = station.takeItem(userId);
    if (!item) return;

    ctx.toRoom(key, "station-updated", {
      station: station.getState(),
      item: item.serialize(),
    });
  }

  startCutting({ roomCode, userId, stationId, playerX, playerY }, ctx) {
    if (
      !roomCode ||
      !userId ||
      !stationId ||
      !isNum(playerX) ||
      !isNum(playerY)
    )
      return;

    const key = code(roomCode);
    const room = this.getRoom(key);
    const station = room.getStation(stationId);

    if (!station || station.type !== "cutting") return;

    // Cập nhật vị trí mới nhất để tick không pause nhầm
    this.positions.set(this.positionKey(key, userId), {
      x: playerX,
      y: playerY,
    });

    if (!station.startCutting(userId, playerX, playerY)) return;

    ctx.toRoom(key, "station-updated", {
      station: station.getState(),
      item: station.item ? station.item.serialize() : null,
    });
  }

  // ===================================================================
  // PLATE
  // ===================================================================

  addIngredientToPlate(
    { roomCode, userId, plateId, itemId, playerX, playerY },
    ctx,
  ) {
    if (
      !roomCode ||
      !userId ||
      !plateId ||
      !itemId ||
      !isNum(playerX) ||
      !isNum(playerY)
    )
      return;

    const key = code(roomCode);

    // Socket phải thuộc đúng phòng và người chơi
    if (ctx.verify && !ctx.verify(key, userId)) return;

    const room = this.getRoom(key);
    const plate = room.getItem(plateId);

    if (!plate || plate.type !== "plate") {
      ctx.toSender("interaction-error", { message: "Plate not found" });
      return;
    }

    if (Math.hypot(playerX - plate.x, playerY - plate.y) > PLATE_RANGE) {
      ctx.toSender("interaction-error", { message: "Too far from plate" });
      return;
    }

    const result = room.addIngredientToPlate(plateId, itemId, userId);

    if (!result || !result.success) {
      ctx.toSender("interaction-error", {
        message: result?.message || "Cannot add ingredient to plate",
      });
      return;
    }

    // Đồng bộ toàn bộ trạng thái phòng
    ctx.toRoom(key, "game-state", room.getState());
  }

  // sourceType: "floor" | "station" | "shelf"
  addToHeldPlate(
    { roomCode, userId, plateId, sourceType, sourceId, playerX, playerY },
    ctx,
  ) {
    if (
      !roomCode ||
      !userId ||
      !plateId ||
      !sourceType ||
      !sourceId ||
      !isNum(playerX) ||
      !isNum(playerY)
    )
      return;

    const key = code(roomCode);

    if (ctx.verify && !ctx.verify(key, userId)) return;

    const room = this.getRoom(key);
    const fail = (message) => ctx.toSender("interaction-error", { message });

    const plate = room.getItem(plateId);

    if (
      !plate ||
      plate.type !== "plate" ||
      plate.state !== "held" ||
      plate.userId !== userId
    ) {
      return fail("You are not holding that plate");
    }

    if ((plate.bakeStatus ?? "raw") !== "raw") {
      return fail("This plate has already been baked");
    }

    let item = null;
    let changedStation = null;

    if (sourceType === "floor") {
      item = room.getItem(sourceId);

      if (!item || item.type === "plate" || item.state !== "available") {
        return fail("Ingredient not available");
      }

      if (Math.hypot(playerX - item.x, playerY - item.y) > HELD_PLATE_RANGE) {
        return fail("Too far from ingredient");
      }

      if (!plate.canAcceptIngredient(item)) {
        return fail("Cannot add this ingredient to the plate");
      }
    } else if (sourceType === "station") {
      const station = room.getStation(sourceId);
      const onStation = station?.item;

      if (!station || !onStation || onStation.type === "plate") {
        return fail("Nothing to take from this station");
      }

      if (
        Math.hypot(playerX - station.x, playerY - station.y) > HELD_PLATE_RANGE
      ) {
        return fail("Too far from station");
      }

      if (!["chopped", "cooked"].includes(onStation.status)) {
        return fail("This ingredient is not ready yet");
      }

      if (!plate.canAcceptIngredient(onStation)) {
        return fail("Cannot add this ingredient to the plate");
      }

      item = station.takeItem(userId); // item chuyển sang "held" bởi userId

      if (!item) return fail("Cannot take item from station");

      changedStation = station;
    } else if (sourceType === "shelf") {
      const shelf = room.getShelf(sourceId);

      if (!shelf) return fail("Shelf not found");

      if (Math.hypot(playerX - shelf.x, playerY - shelf.y) > HELD_PLATE_RANGE) {
        return fail("Too far from shelf");
      }

      item = room.createItemFromShelf(sourceId, userId);

      if (!item) return fail("Cannot take ingredient");
    } else {
      return;
    }

    if (!plate.addIngredient(item)) {
      // Hiếm khi tới đây (đã kiểm tra trước): trả item về trạng thái hợp lệ
      if (sourceType !== "floor") {
        item.state = "available";
        item.userId = null;
      }

      return fail("Cannot add this ingredient to the plate");
    }

    // Nguyên liệu giờ nằm trong đĩa, xoá item riêng khỏi phòng
    room.removeItem(item.id);

    if (changedStation) {
      ctx.toRoom(key, "station-updated", {
        station: changedStation.getState(),
        item: null,
      });
    }

    ctx.toRoom(key, "item-removed", { itemId: item.id, userId });

    // Gửi đĩa với danh sách nguyên liệu mới
    ctx.toRoom(key, "plate-picked", { item: plate.serialize() });
  }

  // ===================================================================
  // TICK (gọi định kỳ ~200ms): nướng chín / cháy / thái / đơn hàng
  // ===================================================================

  tick(toRoom) {
    for (const room of Object.values(this.rooms)) {
      const changed = room.update(
        (userId) =>
          this.positions.get(this.positionKey(room.roomCode, userId)) ?? null,
      );

      for (const station of changed) {
        toRoom(room.roomCode, "station-updated", {
          station: station.getState(),
          item: station.item ? station.item.serialize() : null,
        });
      }

      // Đơn hàng: sinh đơn ngẫu nhiên theo thời gian, bỏ đơn hết hạn
      const before = room.orders.map((o) => o.id).join(",");

      room.updateOrders();

      const after = room.orders.map((o) => o.id).join(",");

      if (before !== after) {
        toRoom(room.roomCode, "orders-updated", {
          orders: room.getOrders(),
          score: room.score,
        });
      }
    }
  }
}
