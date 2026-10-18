class IngredientShelf {
  constructor({ id, ingredientType, x = 0, y = 0 }) {
    this.id = id;
    this.ingredientType = ingredientType;

    this.x = x;
    this.y = y;
  }

  canTake(playerX, playerY, range = 90) {
    const dx = playerX - this.x;
    const dy = playerY - this.y;

    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= range;
  }

  createItem(itemId) {
    return {
      id: itemId,
      type: this.ingredientType,
      state: "held",
      x: this.x,
      y: this.y,
      userId: null,
    };
  }
}

export default IngredientShelf;
