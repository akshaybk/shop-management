import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const Inventory = () => {
  const { user } = useAuth();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [inventory, setInventory] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadInventory = async (selectedShopId) => {
    if (!selectedShopId) return;
    const response = await apiRequest(`/inventory/${selectedShopId}`);
    setInventory(response.inventory || []);
    const [purchaseResponse, adjustmentResponse] = await Promise.all([
      apiRequest(`/inventory/purchases/${selectedShopId}`),
      user.role === "SUPER_MANAGER" ? apiRequest(`/stock-adjustments/shop/${selectedShopId}`) : Promise.resolve({ adjustments: [] }),
    ]);
    setPurchases(purchaseResponse.purchases || []);
    setAdjustments(adjustmentResponse.adjustments || []);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiRequest("/dashboard/my-shops");
        const availableShops = response.data || [];
        setShops(availableShops);
        if (availableShops.length) setShopId(String(availableShops[0].id));
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
    setError("");
    loadInventory(shopId).catch((err) => setError(err.message));
  }, [shopId, user]);

  const totals = useMemo(() => {
    const result = inventory.reduce((summary, item) => {
      summary.items += 1;
      summary.units += Number(item.quantity || 0);
      summary.low += item.quantity <= 10 ? 1 : 0;
      summary.stockValue += Number(item.quantity || 0) * Number(item.sellingPrice || 0);
      summary.units.add(item.unit);
      return summary;
    }, { items: 0, units: 0, low: 0, stockValue: 0, units: new Set() });

    const unitList = [...result.units];
    return {
      ...result,
      totalQuantity: inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      unitLabel: unitList.length === 1 ? unitList[0] : null,
    };
  }, [inventory]);

  const stockRemaining = totals.unitLabel
    ? `${totals.totalQuantity.toLocaleString("en-IN")} ${totals.unitLabel}`
    : `${totals.totalQuantity.toLocaleString("en-IN")} units`;

  if (loading) return <div className="page-loading">Loading inventory...</div>;

  return (
    <main className="app-page">
      <header className="page-header"><div><p className="eyebrow">INVENTORY</p><h1>Stock overview</h1><p>View current stock and recent stock movements for the selected shop.</p></div></header>
      {error && <div className="form-error page-message">{error}</div>}
      {!shops.length ? <section className="panel"><p className="empty">No shop is assigned to your account.</p></section> : <>
        <section className="toolbar panel"><label>Shop<select value={shopId} onChange={(event) => setShopId(event.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}{shop.location ? ` — ${shop.location}` : ""}</option>)}</select></label></section>
        <section className="stats-grid inventory-stats">
          <article className="stat-card"><span>Products</span><strong>{totals.items}</strong></article>
          <article className="stat-card"><span>Stock remaining</span><strong>{stockRemaining}</strong><small className={totals.low ? "stock-hint warning-text" : "stock-hint"}>{totals.low ? `${totals.low} product${totals.low === 1 ? "" : "s"} running low` : "Stock levels look healthy"}</small></article>
          <article className="stat-card"><span>Stock value*</span><strong>{money(totals.stockValue)}</strong></article>
        </section>
        <p className="helper-text">Low-stock warning appears when any product reaches 10 units or less. *Indicative value using current selling prices, not purchase cost.</p>
        <section className="panel"><div className="panel-header"><h2>Current stock</h2><span>{inventory.length} products</span></div>{inventory.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Category</th><th>Quantity</th><th>Selling price</th><th>Status</th><th>Updated</th></tr></thead><tbody>{inventory.map((item) => <tr key={item.productId}><td><strong>{item.productName}</strong><small>{item.unit}</small></td><td>{item.category || "—"}</td><td><strong>{item.quantity}</strong> {item.unit}</td><td>{money(item.sellingPrice)}</td><td><span className={item.quantity <= 10 ? "badge warning" : "badge success"}>{item.quantity <= 10 ? "Low stock" : "In stock"}</span></td><td>{new Date(item.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div> : <p className="empty">No stock has been added to this shop yet.</p>}</section>
        <section className="content-grid">
          <div className="panel"><div className="panel-header"><h2>Recent purchases</h2><span>{purchases.length} shown</span></div>{purchases.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Date</th></tr></thead><tbody>{purchases.slice(0, 10).map((purchase) => <tr key={purchase.id}><td>{purchase.product.name}</td><td>{purchase.quantity} {purchase.product.unit}</td><td>{money(purchase.totalCost)}</td><td>{new Date(purchase.purchasedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div> : <p className="empty">No purchases yet.</p>}</div>
          <div className="panel"><div className="panel-header"><h2>Stock adjustments</h2><span>{user.role === "SUPER_MANAGER" ? `${adjustments.length} shown` : "Super Manager only"}</span></div>{user.role !== "SUPER_MANAGER" ? <p className="empty">Adjustments are controlled by the Super Manager.</p> : adjustments.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Change</th><th>Reason</th><th>Date</th></tr></thead><tbody>{adjustments.slice(0, 10).map((adjustment) => <tr key={adjustment.id}><td>{adjustment.product.name}</td><td><span className={adjustment.quantityChange < 0 ? "badge warning" : "badge success"}>{adjustment.quantityChange > 0 ? `+${adjustment.quantityChange}` : adjustment.quantityChange}</span></td><td>{adjustment.reason}</td><td>{new Date(adjustment.adjustedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div> : <p className="empty">No adjustments recorded.</p>}</div>
        </section>
      </>}
    </main>
  );
};

export default Inventory;
