class Plate {
  constructor({ id, x = 0, y = 0 }) {
    this.id = id;
    this.type = "plate";
    this.bakeStatus = "raw";

    this.x = x;
    this.y = y;

    // Các nguyên liệu đang nằm trên đĩa
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
  // CHECK INGREDIENT
  // =====================================

  canAcceptIngredient(item) {
    if (!item) {
      return false;
    }

    // Không cho đặt một chiếc đĩa khác lên đĩa này
    if (item.type === "plate") {
      return false;
    }

    // Không thêm cùng một item hai lần
    if (
      item.id != null &&
      this.ingredients.some((ingredient) => ingredient.id === item.id)
    ) {
      return false;
    }

    return true;
  }

  // =====================================
  // ADD INGREDIENT TO PLATE
  // =====================================

  addIngredient(item) {
    if (!this.canAcceptIngredient(item)) {
      return false;
    }

    this.ingredients.push({
      id: item.id ?? null,
      type: item.type,
      status: item.status ?? "raw",
    });

    return true;
  }

  // =====================================
  // CHECK PLATE CONTENTS
  // =====================================

  hasIngredient(type) {
    return this.ingredients.some((ingredient) => ingredient.type === type);
  }

  // =====================================
  // REMOVE INGREDIENT
  // =====================================

  removeIngredient(itemId) {
    const index = this.ingredients.findIndex(
      (ingredient) => ingredient.id === itemId,
    );

    if (index === -1) {
      return null;
    }

    return this.ingredients.splice(index, 1)[0];
  }

  // =====================================
  // CHECK PIZZA INGREDIENTS
  // =====================================

  hasPizzaIngredients() {
    return this.hasIngredient("dough") && this.hasIngredient("tomato");
  }

  // =====================================
  // CLEAR PLATE
  // =====================================

  clearIngredients() {
    this.ingredients = [];
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
      bakeStatus: this.bakeStatus,
      ingredients: this.ingredients.map((ingredient) => ({
        ...ingredient,
      })),
    };
  }
}

export default Plate;
