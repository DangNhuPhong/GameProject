import Item from "./Item.js";
import Plate from "./Plate.js";
import IngredientShelf from "./IngredientShelf.js";
import CookingStation from "./CookingStation.js";
import CuttingStation from "./CuttingStation.js";
import PizzaOvenStation from "./PizzaOvenStation.js";

import { getMapLayout } from "../maps/index.js";

// =====================================
// LUẬT CỦA TỪNG LOẠI TRẠM (khoá theo "kind" trong Tiled)
//
// Vị trí lấy từ map; thời gian có thể ghi đè bằng property
// trong Tiled (cookTime, burnTime, cutTime).
// Kind nào không có ở đây (oven, serving-counter...) sẽ bị bỏ qua.
// =====================================

const STATION_FACTORIES = {
  grill: (s) =>
    new CookingStation({
      id: s.id,
      x: s.x,
      y: s.y,
      cookTime: s.props.cookTime ?? 5000,
      burnTime: s.props.burnTime ?? 10000,
      acceptedTypes: ["meat"],
    }),

  "cutting-board": (s) =>
    new CuttingStation({
      id: s.id,
      x: s.x,
      y: s.y,
      cutTime: s.props.cutTime ?? 2000,
      acceptedTypes: ["tomato", "salad"],
    }),

  oven: (s) =>
    new PizzaOvenStation({
      id: s.id,
      x: s.x,
      y: s.y,
      bakeTime: s.props.bakeTime ?? 8000,
      burnTime: s.props.burnTime ?? 10000,
    }),
};

class GameRoom {
  constructor(roomCode, mapId = "kitchen") {
    this.roomCode = roomCode;

    this.items = [];
    this.nextItemId = 1;

    this.orders = [];
    this.nextOrderId = 1;
    this.nextOrderAt = Date.now() + 12000;

    this.score = 0;

    // Layout lấy từ file map
    const layout = getMapLayout(mapId);

    this.mapId = layout.id;

    this.specialStations = layout.stations
      .filter((s) =>
        ["serving-counter", "trash-bin", "order-station"].includes(s.kind),
      )
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        x: s.x,
        y: s.y,
      }));

    this.spawn = layout.spawn;

    // Bắt đầu với 2 đơn ngẫu nhiên, sau đó cứ 12 giây thêm 1 đơn (tối đa 3)
    this.createOrder();
    this.createOrder();

    // Kệ nguyên liệu
    this.shelves = layout.shelves.map(
      (s) =>
        new IngredientShelf({
          id: s.id,
          ingredientType: s.ingredient,
          x: s.x,
          y: s.y,
        }),
    );

    // Bàn đĩa
    const plate = layout.stations.find((s) => s.kind === "plate-station");

    this.plateStation = plate ? { id: plate.id, x: plate.x, y: plate.y } : null;

    // Trạm nấu / sơ chế
    this.stations = layout.stations
      .filter((s) => STATION_FACTORIES[s.kind])
      .map((s) => STATION_FACTORIES[s.kind](s));
  }

  createOrder() {
    const choices = [
      {
        recipeId: "hamburger",
        name: "Hamburger",
        durationMs: 90000,
      },
      {
        recipeId: "pizza",
        name: "Pizza",
        durationMs: 120000,
      },
      {
        recipeId: "salad",
        name: "Salad",
        durationMs: 60000,
      },
    ];

    const choice = choices[Math.floor(Math.random() * choices.length)];

    const createdAt = Date.now();

    const order = {
      id: `${this.roomCode}-order-${this.nextOrderId++}`,
      ...choice,
      createdAt,
      expiresAt: createdAt + choice.durationMs,
      status: "waiting",
    };

    this.orders.push(order);
    return order;
  }

  updateOrders(now = Date.now()) {
    this.orders = this.orders.filter(
      (order) => order.expiresAt > now && order.status === "waiting",
    );

    if (this.orders.length < 3 && now >= this.nextOrderAt) {
      this.createOrder();
      this.nextOrderAt = now + 12000;
    }

    return this.orders;
  }

  getOrders() {
    this.updateOrders();

    return this.orders.map((order) => ({
      ...order,
      remainingMs: Math.max(0, order.expiresAt - Date.now()),
    }));
  }

  submitPlate(plate) {
    if (!plate || plate.type !== "plate" || !Array.isArray(plate.ingredients)) {
      return {
        success: false,
        message: "Hold a prepared plate to serve",
      };
    }

    // Chuẩn hoá: nguyên liệu trên đĩa có thể là object { type, status } hoặc chuỗi
    const ingredients = plate.ingredients.map((i) =>
      typeof i === "string"
        ? { type: i, status: "raw" }
        : {
            type: i.type ?? i.ingredientType,
            status: i.status ?? "raw",
          },
    );

    const exactRecipe = (expected) =>
      ingredients.length === expected.length &&
      expected.every(([type, status]) =>
        ingredients.some(
          (i) => i.type === type && (!status || i.status === status),
        ),
      );

    if (
      exactRecipe([["dough"], ["tomato", "chopped"]]) &&
      plate.bakeStatus !== "cooked"
    ) {
      return {
        success: false,
        message:
          plate.bakeStatus === "burnt"
            ? "The pizza is burnt!"
            : "Bake the pizza in the oven first",
      };
    }

    const recipes = [
      {
        id: "hamburger",
        valid: () =>
          exactRecipe([["bread"], ["meat", "cooked"], ["tomato", "chopped"]]),
      },
      {
        id: "pizza",
        valid: () => exactRecipe([["dough"], ["tomato", "chopped"]]),
      },
      {
        id: "salad",
        valid: () => exactRecipe([["salad", "chopped"]]),
      },
    ];

    const recipe = recipes.find((r) => r.valid());

    if (!recipe) {
      console.log("[serve] plate ingredients:", JSON.stringify(ingredients));

      return {
        success: false,
        message: "Recipe is incomplete or incorrect",
      };
    }

    this.updateOrders();

    const orderIndex = this.orders.findIndex(
      (order) =>
        order.recipeId === recipe.id &&
        order.status === "waiting" &&
        order.expiresAt > Date.now(),
    );

    if (orderIndex < 0) {
      return {
        success: false,
        message: `No active ${recipe.id} order`,
      };
    }

    // orderIndex là đơn ĐẦU TIÊN (sớm nhất) khớp món, vì this.orders xếp theo thời gian tạo
    const [completed] = this.orders.splice(orderIndex, 1);

    this.removeItem(plate.id);

    // Điểm = 50 + số giây còn lại của đơn
    const remainingMs = Math.max(0, completed.expiresAt - Date.now());
    const points = 50 + Math.round(remainingMs / 1000);

    this.score += points;

    return {
      success: true,
      recipeId: recipe.id,
      order: completed,
      points,
      score: this.score,
    };
  }

  // =====================================
  // SHELF
  // =====================================

  getShelf(shelfId) {
    return this.shelves.find((shelf) => shelf.id === shelfId);
  }

  // =====================================
  // STATION
  // =====================================

  getStation(stationId) {
    return this.stations.find((station) => station.id === stationId);
  }

  // =====================================
  // CREATE ITEM FROM SHELF
  // =====================================

  createItemFromShelf(shelfId, userId) {
    const shelf = this.getShelf(shelfId);

    if (!shelf) {
      return null;
    }

    const itemId = `${this.roomCode}-item-${this.nextItemId}`;

    this.nextItemId++;

    const item = new Item({
      id: itemId,
      type: shelf.ingredientType,
      x: shelf.x,
      y: shelf.y,
    });

    // Tạo xong thì người chơi cầm luôn
    if (!item.pick(userId)) {
      return null;
    }

    this.items.push(item);

    return item;
  }

  // =====================================
  // CREATE PLATE
  // =====================================

  createPlate(userId) {
    // Map không có bàn đĩa
    if (!this.plateStation) {
      return null;
    }

    const plateId = `${this.roomCode}-plate-${this.nextItemId}`;

    this.nextItemId++;

    const plate = new Plate({
      id: plateId,
      x: this.plateStation.x,
      y: this.plateStation.y,
    });

    // Tạo xong thì người chơi cầm luôn
    if (!plate.pick(userId)) {
      return null;
    }

    this.items.push(plate);

    return plate;
  }

  // =====================================
  // ITEM
  // =====================================

  getItem(itemId) {
    return this.items.find((item) => item.id === itemId);
  }

  removeItem(itemId) {
    const index = this.items.findIndex((item) => item.id === itemId);

    if (index === -1) {
      return false;
    }

    this.items.splice(index, 1);

    return true;
  }

  // =====================================
  // ADD INGREDIENT TO PLATE
  // =====================================

  addIngredientToPlate(plateId, itemId, userId) {
    const plate = this.getItem(plateId);
    const item = this.getItem(itemId);

    // Đĩa và nguyên liệu phải tồn tại
    if (!plate || !item) {
      return {
        success: false,
        message: "Plate or ingredient not found",
      };
    }

    // Chỉ được thêm nguyên liệu vào đĩa
    if (plate.type !== "plate" || item.type === "plate") {
      return {
        success: false,
        message: "Invalid plate or ingredient",
      };
    }

    // Đĩa phải đang nằm trên mặt đất / ở trạng thái available
    if (plate.state !== "available") {
      return {
        success: false,
        message: "Plate must be placed down first",
      };
    }

    // Nguyên liệu phải do người chơi hiện tại cầm
    if (item.state !== "held" || item.userId !== userId) {
      return {
        success: false,
        message: "You are not holding this ingredient",
      };
    }

    // Thêm nguyên liệu vào đĩa
    const added = plate.addIngredient(item);

    if (!added) {
      return {
        success: false,
        message: "Cannot add this ingredient to the plate",
      };
    }

    // Xóa nguyên liệu riêng khỏi danh sách item trong phòng
    this.removeItem(itemId);

    return {
      success: true,
      plate,
    };
  }

  // =====================================
  // UPDATE
  //
  // getPlayerPosition(userId) -> { x, y } | null
  // Trạm thái dùng nó để tạm dừng khi người chơi rời đi.
  // =====================================

  update(getPlayerPosition = null) {
    const now = Date.now();

    return this.stations.filter((station) =>
      station.update(now, getPlayerPosition),
    );
  }

  // =====================================
  // GAME STATE
  // =====================================

  getState() {
    return {
      roomCode: this.roomCode,
      mapId: this.mapId,
      spawn: this.spawn,

      items: this.items.map((item) => item.serialize()),

      shelves: this.shelves.map((shelf) => ({
        id: shelf.id,
        ingredientType: shelf.ingredientType,
        x: shelf.x,
        y: shelf.y,
      })),

      stations: this.stations.map((station) => station.getState()),

      plateStation: this.plateStation,

      orders: this.getOrders(),
      score: this.score,
    };
  }
}

export default GameRoom;
