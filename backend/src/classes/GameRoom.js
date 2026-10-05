import Item from "./Item.js";
import IngredientShelf from "./IngredientShelf.js";
import CookingStation from "./CookingStation.js";

class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;

    this.items = [];

    this.nextItemId = 1;

    this.shelves = [
      new IngredientShelf({
        id: "meat-shelf",
        ingredientType: "meat",
        x: 160,
        y: 150,
      }),
    ];

    // Các trạm làm việc. Sau này thêm CuttingStation,
    // WashingStation... chỉ cần push vào mảng này.
    this.stations = [
      new CookingStation({
        id: "grill",
        x: 450,
        y: 150,
        cookTime: 5000, // 5 giây thì chín
        burnTime: 10000, // 10 giây thì cháy
      }),
    ];
  }

  getShelf(shelfId) {
    return this.shelves.find((shelf) => shelf.id === shelfId);
  }

  getStation(stationId) {
    return this.stations.find((station) => station.id === stationId);
  }

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

    if (!item.pick(userId)) {
      return null;
    }

    this.items.push(item);

    return item;
  }

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

  // Gọi định kỳ từ server. Trả về danh sách trạm vừa thay đổi.
  update() {
    const now = Date.now();

    return this.stations.filter((station) => station.update(now));
  }

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
    };
  }
}

export default GameRoom;
