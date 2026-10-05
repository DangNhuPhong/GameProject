import Item from "./Item.js";
import IngredientShelf from "./IngredientShelf.js";

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
  }

  getShelf(shelfId) {
    return this.shelves.find((shelf) => shelf.id === shelfId);
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

  getState() {
    return {
      roomCode: this.roomCode,

      items: this.items.map((item) => ({
        id: item.id,
        type: item.type,
        state: item.state,
        x: item.x,
        y: item.y,
        userId: item.userId,
      })),

      shelves: this.shelves.map((shelf) => ({
        id: shelf.id,
        ingredientType: shelf.ingredientType,
        x: shelf.x,
        y: shelf.y,
      })),
    };
  }
}

export default GameRoom;
