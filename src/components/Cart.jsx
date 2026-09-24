import CartItem from "./CartItem.jsx";

function Cart({ items, total, onIncrease, onDecrease, onRemove }) {
  return (
    <aside className="cart-panel" aria-label="Shopping cart">
      <div className="cart-header">
        <h2>Your Cart</h2>
        <span>{items.length} products</span>
      </div>

      {items.length === 0 ? (
        <p className="empty-cart">Your cart is empty.</p>
      ) : (
        <div className="cart-items">
          {items.map((item) => (
            <CartItem
              item={item}
              key={item.id}
              onIncrease={onIncrease}
              onDecrease={onDecrease}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      <div className="cart-total">
        <span>Total</span>
        <strong>${total.toFixed(2)}</strong>
      </div>
    </aside>
  );
}

export default Cart;
