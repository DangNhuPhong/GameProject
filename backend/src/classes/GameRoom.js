import Item from "./Item.js";
import Plate from "./Plate.js";
import IngredientShelf from "./IngredientShelf.js";
import CookingStation from "./CookingStation.js";
import CuttingStation from "./CuttingStation.js";

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
};

class GameRoom {
  constructor(roomCode, mapId = "kitchen") {
    this.roomCode = roomCode;

    this.items = [];
    this.nextItemId = 1;

    // Layout lấy từ file map
    const layout = getMapLayout(mapId);

    this.mapId = layout.id;
    this.spawn = layout.spawn;

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
    };
  }
}

export default GameRoom;
