import Item from "./Item.js";
import Plate from "./Plate.js";
import IngredientShelf from "./IngredientShelf.js";
import CookingStation from "./CookingStation.js";
import CuttingStation from "./CuttingStation.js";

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
        x: 160,
        y: 150,
      }),

      new IngredientShelf({
        id: "tomato-shelf",
        ingredientType: "tomato",
        x: 740,
        y: 150,
      }),

      new IngredientShelf({
        id: "salad-shelf",
        ingredientType: "salad",
        x: 980,
        y: 150,
      }),

      new IngredientShelf({
        id: "bread-shelf",
        ingredientType: "bread",
        x: 160,
        y: 300,
      }),

      new IngredientShelf({
        id: "dough-shelf",
        ingredientType: "dough",
        x: 350,
        y: 300,
      }),
    ];

    // =====================================
    // WORKING STATIONS
    // =====================================

    this.plateStation = {
      id: "plate-station",
      x: 550,
      y: 350,
    };

    this.stations = [
      // =====================================
      // GRILL
      // =====================================

      new CookingStation({
        id: "grill",
        x: 450,
        y: 150,
        cookTime: 5000,
        burnTime: 10000,
        acceptedTypes: ["meat"],
      }),

      // =====================================
      // CUTTING BOARD
      // =====================================

      new CuttingStation({
        id: "cutting-board",
        x: 600,
        y: 150,
        cutTime: 2000,
        acceptedTypes: ["tomato"],
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
  // UPDATE
  // =====================================

  update() {
    const now = Date.now();

    return this.stations.filter((station) => station.update(now));
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
