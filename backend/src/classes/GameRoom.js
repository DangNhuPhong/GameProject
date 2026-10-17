import Item from "./Item.js";
import Plate from "./Plate.js";
import IngredientShelf from "./IngredientShelf.js";
import CookingStation from "./CookingStation.js";
import CuttingStation from "./CuttingStation.js";

// =====================================
// LAYOUT  (phải khớp với LAYOUT trong Game.jsx)
//
//  Quầy tường (y = 150)
//  Meat(110) → Grill(280) | Tomato(470) → Cutting(640) | Salad(830)
//
//  Đảo giữa phòng (y = 400)
//  Bread(300) | Dough(470) | Plates(800)
// =====================================

const COUNTER_Y = 150;
const ISLAND_Y = 400;

class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;

    this.items = [];

    this.nextItemId = 1;

    // =====================================
    // INGREDIENT SHELVES
    // =====================================

    this.shelves = [
      new IngredientShelf({
        id: "meat-shelf",
        ingredientType: "meat",
        x: 110,
        y: COUNTER_Y,
      }),

      new IngredientShelf({
        id: "tomato-shelf",
        ingredientType: "tomato",
        x: 470,
        y: COUNTER_Y,
      }),

      new IngredientShelf({
        id: "salad-shelf",
        ingredientType: "salad",
        x: 830,
        y: COUNTER_Y,
      }),

      new IngredientShelf({
        id: "bread-shelf",
        ingredientType: "bread",
        x: 300,
        y: ISLAND_Y,
      }),

      new IngredientShelf({
        id: "dough-shelf",
        ingredientType: "dough",
        x: 470,
        y: ISLAND_Y,
      }),
    ];

    // =====================================
    // WORKING STATIONS
    // =====================================

    this.plateStation = {
      id: "plate-station",
      x: 800,
      y: ISLAND_Y,
    };

    this.stations = [
      // GRILL
      new CookingStation({
        id: "grill",
        x: 280,
        y: COUNTER_Y,
        cookTime: 5000,
        burnTime: 10000,
        acceptedTypes: ["meat"],
      }),

      // CUTTING BOARD
      new CuttingStation({
        id: "cutting-board",
        x: 640,
        y: COUNTER_Y,
        cutTime: 2000,
        acceptedTypes: ["tomato", "salad"],
      }),
    ];
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
  // =====================================

  update(getPlayerPosition) {
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

      items: this.items.map((item) => item.serialize()),

      shelves: this.shelves.map((shelf) => ({
        id: shelf.id,
        ingredientType: shelf.ingredientType,
        x: shelf.x,
        y: shelf.y,
      })),

      stations: this.stations.map((station) => station.getState()),

      plateStation: {
        id: this.plateStation.id,
        x: this.plateStation.x,
        y: this.plateStation.y,
      },
    };
  }
}

export default GameRoom;
