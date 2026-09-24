import { useEffect, useReducer, useState } from "react";
import ProductList from "./components/ProductList.jsx";
import Cart from "./components/Cart.jsx";
import {
  CART_CATALOG_VERSION_KEY,
  CART_STORAGE_KEY,
  CATALOG_VERSION,
  cartReducer,
  loadSavedCart,
} from "./cart/cartReducer.js";
import { products } from "./data/products.js";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function App() {
  const [cart, dispatch] = useReducer(cartReducer, [], () => loadSavedCart(CATALOG_VERSION));
  const [selectedFile, setSelectedFile] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    localStorage.setItem(CART_CATALOG_VERSION_KEY, CATALOG_VERSION);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  function addToCart(product) {
    dispatch({ type: "add_item", payload: { product } });
  }

  function increaseQuantity(productId) {
    dispatch({ type: "increase_quantity", payload: { productId } });
  }

  function decreaseQuantity(productId) {
    dispatch({ type: "decrease_quantity", payload: { productId } });
  }

  function removeFromCart(productId) {
    dispatch({ type: "remove_item", payload: { productId } });
  }

  async function importGroceryList() {
    if (!selectedFile) {
      setImportMessage("Choose a grocery list image first");
      return;
    }

    setIsImporting(true);
    setImportMessage("Reading grocery list...");

    try {
      const imageDataUrl = await readFileAsDataUrl(selectedFile);
      const response = await fetch("/api/import-grocery-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          imageDataUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not import grocery list.");
      }

      for (const match of result.matches) {
        console.log(
          `Matched '${match.aiItem.item}' -> '${match.product.name}' (score: ${match.score})`,
        );

        dispatch({
          type: "add_item",
          payload: {
            product: match.product,
            quantity: match.quantity,
          },
        });
      }

      if (result.unmatched.length > 0) {
        const unmatchedNames = result.unmatched.map((aiItem) => aiItem.item).join(", ");
        console.warn(`No match found for: ${unmatchedNames}. Please pick manually.`);
        setImportMessage(
          `Added ${result.matches.length} items. Please pick manually: ${unmatchedNames}`,
        );
        return;
      }

      setImportMessage(
        result.matches.length > 0 ? `Added ${result.matches.length} items to cart` : result.message,
      );
    } catch (error) {
      setImportMessage(error.message);
    } finally {
      setIsImporting(false);
    }
  }

  const cartTotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const cartItemCount = cart.reduce((count, item) => count + item.quantity, 0);

  return (
    <main className="app-shell">
      <section className="store-panel">
        <header className="app-header">
          <div>
            <p className="eyebrow">FreshCart Prototype</p>
            <h1>Groceries</h1>
          </div>
          <div className="cart-pill">{cartItemCount} items</div>
        </header>

        <div className="import-panel">
          <input
            accept="image/*"
            aria-label="Grocery list image"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
              setImportMessage("");
            }}
            type="file"
          />
          <button disabled={isImporting} type="button" onClick={importGroceryList}>
            {isImporting ? "Importing..." : "Import Grocery List"}
          </button>
          {importMessage ? <p>{importMessage}</p> : null}
        </div>

        <ProductList products={products} onAddToCart={addToCart} />
      </section>

      <Cart
        items={cart}
        total={cartTotal}
        onIncrease={increaseQuantity}
        onDecrease={decreaseQuantity}
        onRemove={removeFromCart}
      />
    </main>
  );
}

export default App;
