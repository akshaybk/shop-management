import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const Sales = () => {
  const { user } = useAuth();
  const [shops, setShops] = useState([]);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [shopId, setShopId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(productId)),
    [products, productId],
  );

  const loadSales = async (selectedShopId) => {
    if (!selectedShopId) return;
    const response = await apiRequest(`/sales/shop/${selectedShopId}`);
    setSales(response.sales || []);
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
  }, [user]);

  useEffect(() => {
    if (!shopId) return;
    loadSales(shopId).catch((err) => setError(err.message));
  }, [shopId]);

  const submitSale = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const parsedQuantity = Number(quantity);
    if (!shopId || !productId || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Select a shop and product, then enter a positive whole-number quantity.");
      return;
    }

    try {
      setSaving(true);
      const response = await apiRequest("/sales", {
        method: "POST",
        body: JSON.stringify({
          shopId: Number(shopId),
          productId: Number(productId),
          quantity: parsedQuantity,
        }),
      });
      setSuccess(`${response.message}. ${parsedQuantity} ${selectedProduct?.unit || "units"} sold for ${money(response.sale.totalAmount)}.`);
      setQuantity("");
      await loadSales(shopId);
    } catch (err) {
      setError(err.data?.availableQuantity !== undefined
        ? `${err.message}. Available stock: ${err.data.availableQuantity} ${selectedProduct?.unit || "units"}.`
        : err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-loading">Loading sales...</div>;

  return (
    <main className="app-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">SALES</p>
          <h1>Record a sale</h1>
          <p>Enter only the quantity sold. The current selling price is applied automatically.</p>
        </div>
      </header>

      {error && <div className="form-error page-message">{error}</div>}
      {success && <div className="form-success page-message">{success}</div>}

      <section className="content-grid sales-grid">
        <div className="panel">
          <div className="panel-header"><h2>New sale</h2><span>Stock is updated automatically</span></div>
          {!shops.length ? <p className="empty">No shop is assigned to your account.</p> : !products.length ? <p className="empty">No active products are available.</p> : (
            <form className="operation-form" onSubmit={submitSale}>
              <label>Shop<select value={shopId} onChange={(event) => setShopId(event.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}{shop.location ? ` — ${shop.location}` : ""}</option>)}</select></label>
              <label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {money(product.sellingPrice)} / {product.unit}</option>)}</select></label>
              <label>Quantity sold<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="e.g. 10" /></label>
              <div className="sale-preview">
                <span>Unit selling price</span><strong>{money(selectedProduct?.sellingPrice)}</strong>
                <span>Sale amount</span><strong>{money(Number(quantity || 0) * Number(selectedProduct?.sellingPrice || 0))}</strong>
              </div>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Recording..." : "Record sale"}</button>
            </form>
          )}
        </div>

        <div className="panel">
          <div className="panel-header"><h2>Sales history</h2><span>{sales.length} shown</span></div>
          {sales.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th><th>Date</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><strong>{sale.product.name}</strong><small>{sale.product.unit}</small></td><td>{sale.quantity}</td><td>{money(sale.unitSellingPrice)}</td><td><strong>{money(sale.totalAmount)}</strong></td><td>{new Date(sale.soldAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div> : <p className="empty">No sales recorded for this shop yet.</p>}
        </div>
      </section>
    </main>
  );
};

export default Sales;
