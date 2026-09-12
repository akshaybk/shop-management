import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const Purchases = () => {
  const [shops, setShops] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [shopId, setShopId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(productId)),
    [products, productId],
  );

  const totalCost = Number(quantity || 0) * Number(unitCost || 0);

  const loadShopData = async (selectedShopId) => {
    if (!selectedShopId) return;
    const [inventoryResponse, purchasesResponse] = await Promise.all([
      apiRequest(`/inventory/${selectedShopId}`),
      apiRequest(`/inventory/purchases/${selectedShopId}`).catch(() => null),
    ]);
    setInventory(inventoryResponse.inventory || []);
    setPurchases(purchasesResponse?.purchases || []);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [shopsResponse, productsResponse] = await Promise.all([
          apiRequest("/dashboard/my-shops"),
          apiRequest("/products"),
        ]);
        const availableShops = shopsResponse.data || [];
        const activeProducts = (productsResponse.products || []).filter((product) => product.active);
        setShops(availableShops);
        setProducts(activeProducts);
        if (availableShops.length) setShopId(String(availableShops[0].id));
        if (activeProducts.length) setProductId(String(activeProducts[0].id));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!shopId) return;
    loadShopData(shopId).catch((err) => setError(err.message));
  }, [shopId]);

  const submitPurchase = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const parsedQuantity = Number(quantity);
    const parsedUnitCost = Number(unitCost);
    if (!shopId || !productId || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Select a shop and product, then enter a positive whole-number quantity.");
      return;
    }
    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) {
      setError("Enter a valid non-negative purchase cost per unit.");
      return;
    }

    try {
      setSaving(true);
      const response = await apiRequest("/inventory/purchase", {
        method: "POST",
        body: JSON.stringify({
          shopId: Number(shopId),
          productId: Number(productId),
          quantity: parsedQuantity,
          unitCost: parsedUnitCost,
        }),
      });
      setSuccess(`${response.message}. ${parsedQuantity} ${selectedProduct?.unit || "units"} added for ${money(response.purchase.totalCost)}.`);
      setQuantity("");
      setUnitCost("");
      await loadShopData(shopId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-loading">Loading purchases...</div>;

  return (
    <main className="app-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">PURCHASES</p>
          <h1>Add stock</h1>
          <p>Record incoming stock with its actual purchase cost. Inventory increases automatically.</p>
        </div>
      </header>

      {error && <div className="form-error page-message">{error}</div>}
      {success && <div className="form-success page-message">{success}</div>}

      <section className="content-grid sales-grid">
        <div className="panel">
          <div className="panel-header"><h2>New purchase</h2><span>Purchase cost is deducted from balance</span></div>
          {!shops.length ? <p className="empty">No shop is assigned to your account.</p> : !products.length ? <p className="empty">No active products are available.</p> : (
            <form className="operation-form" onSubmit={submitPurchase}>
              <label>Shop<select value={shopId} onChange={(event) => setShopId(event.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}{shop.location ? ` — ${shop.location}` : ""}</option>)}</select></label>
              <label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {money(product.sellingPrice)} / {product.unit}</option>)}</select></label>
              <label>Quantity purchased<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="e.g. 100" /></label>
              <label>Purchase cost / unit<input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="e.g. 50" /></label>
              <div className="sale-preview"><span>Purchase cost</span><strong>{money(Number(unitCost || 0))} / {selectedProduct?.unit || "unit"}</strong><span>Total cost</span><strong>{money(totalCost)}</strong></div>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Recording..." : "Record purchase"}</button>
            </form>
          )}
        </div>

        <div className="panel">
          <div className="panel-header"><h2>Current stock</h2><span>{inventory.length} products</span></div>
          {inventory.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Stock</th><th>Selling price</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.productId}><td><strong>{item.productName}</strong><small>{item.category || "Uncategorized"}</small></td><td>{item.quantity} {item.unit}</td><td>{money(item.sellingPrice)}</td></tr>)}</tbody></table></div> : <p className="empty">No inventory recorded yet.</p>}
        </div>
      </section>

      {purchases.length > 0 && <section className="panel">
        <div className="panel-header"><h2>Purchase history</h2><span>{purchases.length} shown</span></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Total</th><th>Date</th></tr></thead><tbody>{purchases.map((purchase) => <tr key={purchase.id}><td><strong>{purchase.product?.name || "Product"}</strong></td><td>{purchase.quantity}</td><td>{money(purchase.unitCost)}</td><td><strong>{money(purchase.totalCost)}</strong></td><td>{new Date(purchase.purchasedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div>
      </section>}
    </main>
  );
};

export default Purchases;
