class Plate {
  constructor({ id, x = 0, y = 0 }) {
    this.id = id;

    this.type = "plate";

    this.x = x;
    this.y = y;

    // Item đang được đặt trên đĩa
    this.ingredients = [];

    // available / held
    this.state = "available";

    this.userId = null;
  }

  // =====================================
  // PICK PLATE
  // =====================================

  pick(userId) {
    if (this.state !== "available") {
      return false;
    }

    this.state = "held";
    this.userId = userId;

    return true;
  }

  // =====================================
  // DROP PLATE
  // =====================================

  drop(userId, x, y) {
    if (this.state !== "held" || this.userId !== userId) {
      return false;
    }

    this.state = "available";
    this.userId = null;

    this.x = x;
    this.y = y;

    return true;
  }

  // =====================================
  // ADD INGREDIENT
  // =====================================

  addIngredient(item) {
    if (!item) {
      return false;
    }

    this.ingredients.push({
      type: item.type,
      status: item.status,
    });

    return true;
  }

  // =====================================
  // SERIALIZE
  // =====================================

  serialize() {
    return {
      id: this.id,
      type: this.type,

      x: this.x,
      y: this.y,

      state: this.state,
      userId: this.userId,

      ingredients: this.ingredients,
    };
  }
}

export default Plate;
