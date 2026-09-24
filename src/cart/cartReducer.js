export const CART_STORAGE_KEY = "freshcart_cart";
export const CART_CATALOG_VERSION_KEY = "freshcart_catalog_version";
export const CATALOG_VERSION = "test-list-catalog-v1";

export function cartReducer(cart, action) {
  switch (action.type) {
    case "add_item": {
      const { product, quantity = 1 } = action.payload;
      const quantityToAdd = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
      const existingItem = cart.find((item) => item.id === product.id);

      if (existingItem) {
        return cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantityToAdd }
            : item,
        );
      }

      return [...cart, { ...product, quantity: quantityToAdd }];
    }

    case "remove_item":
      return cart.filter((item) => item.id !== action.payload.productId);

    case "increase_quantity":
      return cart.map((item) =>
        item.id === action.payload.productId ? { ...item, quantity: item.quantity + 1 } : item,
      );

    case "decrease_quantity":
      return cart
        .map((item) =>
          item.id === action.payload.productId ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0);

    default:
      return cart;
  }
}

export function loadSavedCart(expectedCatalogVersion = CATALOG_VERSION) {
  try {
    if (typeof localStorage === "undefined") {
      return [];
    }

    const savedCatalogVersion = localStorage.getItem(CART_CATALOG_VERSION_KEY);
    if (savedCatalogVersion !== expectedCatalogVersion) {
      return [];
    }

    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    const parsedCart = savedCart ? JSON.parse(savedCart) : [];
    return Array.isArray(parsedCart) ? parsedCart : [];
  } catch {
    return [];
  }
}
