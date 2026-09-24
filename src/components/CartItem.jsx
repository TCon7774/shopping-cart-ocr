function CartItem({ item, onIncrease, onDecrease, onRemove }) {
  const itemTotal = item.price * item.quantity;

  return (
    <article className="cart-item">
      <div className="cart-item-main">
        <h3>{item.name}</h3>
        <p>
          ${item.price.toFixed(2)} each - ${itemTotal.toFixed(2)} total
        </p>
      </div>

      <div className="cart-item-actions">
        <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => onDecrease(item.id)}>
          -
        </button>
        <span>{item.quantity}</span>
        <button type="button" aria-label={`Increase ${item.name}`} onClick={() => onIncrease(item.id)}>
          +
        </button>
        <button className="remove-button" type="button" onClick={() => onRemove(item.id)}>
          Remove
        </button>
      </div>
    </article>
  );
}

export default CartItem;
