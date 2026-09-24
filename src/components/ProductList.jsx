function ProductList({ products, onAddToCart }) {
  return (
    <section className="product-grid" aria-label="Grocery products">
      {products.map((product) => (
        <article className="product-card" key={product.id}>
          <div>
            <h2>{product.name}</h2>
            <p>{product.brand}</p>
            {product.attributes?.length ? (
              <p className="product-attributes">{product.attributes.join(", ")}</p>
            ) : null}
          </div>

          <div className="product-card-footer">
            <span>${product.price.toFixed(2)}</span>
            <button type="button" onClick={() => onAddToCart(product)}>
              Add to Cart
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

export default ProductList;
