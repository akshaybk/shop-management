import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const Stat = ({ label, value, hint }) => <article className="stat-card"><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</article>;

const ShareholderDashboard = () => {
  const { user } = useAuth();
  const [shops, setShops] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [selectedShop, setSelectedShop] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await apiRequest("/dashboard/my-shops");
        const assignedShops = response.data || [];
        setShops(assignedShops);
        const results = await Promise.all(assignedShops.map((shop) => apiRequest(`/dashboard/shop/${shop.id}`)));
        setDashboards(results.map((result) => result.data));
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    };
    load();
  }, []);

  const visibleDashboards = useMemo(() => selectedShop === "all" ? dashboards : dashboards.filter((dashboard) => dashboard.shop.id === Number(selectedShop)), [dashboards, selectedShop]);
  const totals = useMemo(() => visibleDashboards.reduce((acc, dashboard) => {
    acc.balance += Number(dashboard.financial.currentBalance || 0);
    acc.sales += Number(dashboard.financial.totalSales || 0);
    acc.purchases += Number(dashboard.financial.totalPurchases || 0);
    acc.expenses += Number(dashboard.financial.totalExpenses || 0);
    return acc;
  }, { balance: 0, sales: 0, purchases: 0, expenses: 0 }), [visibleDashboards]);

  if (loading) return <div className="page-loading">Loading shareholder view...</div>;
  if (error) return <main className="app-page"><div className="form-error">{error}</div></main>;
  if (!shops.length) return <main className="app-page"><header className="page-header"><p className="eyebrow">SHAREHOLDER VIEW</p><h1>Welcome, {user.name}</h1><p>No shop has been assigned to your shareholder account yet.</p></header><section className="panel empty-module"><strong>Waiting for shop assignment</strong><p>The Super Manager will need to assign your shareholder account to a shop before its information appears here.</p></section></main>;

  return <main className="app-page">
    <header className="page-header shareholder-header"><div><p className="eyebrow">SHAREHOLDER VIEW</p><h1>Welcome, {user.name}</h1><p>Read-only view of the shops in which you have a stake.</p></div><div className="readonly-badge">Read only</div></header>
    <section className="toolbar panel"><div><label htmlFor="shareholder-shop">Shop</label><select id="shareholder-shop" value={selectedShop} onChange={(event) => setSelectedShop(event.target.value)}><option value="all">All my shops</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></div></section>
    <section className="stats-grid"><Stat label="My shops" value={visibleDashboards.length} /><Stat label="Current balance" value={money(totals.balance)} hint="Operating balance, not profit" /><Stat label="Total sales" value={money(totals.sales)} /><Stat label="Total expenses" value={money(totals.expenses)} /></section>
    <section className="panel"><div className="panel-header"><h2>My shop performance</h2><span>{visibleDashboards.length} shop{visibleDashboards.length === 1 ? "" : "s"}</span></div><div className="shareholder-shop-list">{visibleDashboards.map((dashboard) => {
      const shopInfo = shops.find((shop) => shop.id === dashboard.shop.id);
      return <article className="shareholder-shop-card" key={dashboard.shop.id}>
        <div className="shareholder-shop-title"><div><p className="eyebrow">SHOP</p><h3>{dashboard.shop.name}</h3><small>{dashboard.shop.location || "No location"}</small></div><span className="stake-badge">{shopInfo?.stakePercentage != null ? `${shopInfo.stakePercentage}% ownership` : "Ownership not specified"}</span></div>
        <div className="mini-stats"><div><span>Current balance</span><strong>{money(dashboard.financial.currentBalance)}</strong></div><div><span>Total sales</span><strong>{money(dashboard.financial.totalSales)}</strong></div><div><span>Purchases</span><strong>{money(dashboard.financial.totalPurchases)}</strong></div><div><span>Expenses</span><strong>{money(dashboard.financial.totalExpenses)}</strong></div></div>
        <div className="shareholder-section-title">Today's activity</div><div className="activity-row"><span>Sales</span><strong>{money(dashboard.today.sales)}</strong><span>Purchases</span><strong>{money(dashboard.today.purchases)}</strong><span>Expenses</span><strong>{money(dashboard.today.expenses)}</strong></div>
      </article>;
    })}</div></section>
    <section className="content-grid">{visibleDashboards.map((dashboard) => <div className="panel" key={`inventory-${dashboard.shop.id}`}><div className="panel-header"><h2>{dashboard.shop.name} inventory</h2><span>{dashboard.inventory.length} products</span></div>{dashboard.inventory.length ? dashboard.inventory.map((item) => <div className="inventory-row" key={`${dashboard.shop.id}-${item.productId}`}><div><strong>{item.productName}</strong><small>{money(item.sellingPrice)} / {item.unit}</small></div><span className={item.lowStock ? "badge warning" : "badge"}>{item.quantity} {item.unit}{item.lowStock ? " · Low stock" : ""}</span></div>) : <p className="empty">No inventory yet.</p>}</div>)}</section>
    <section className="panel information-note"><div className="panel-header"><h2>About your ownership</h2></div><p>Your ownership percentage is shown separately from the shop's operating balance. The current balance is not your personal profit or an amount payable to you.</p></section>
  </main>;
};
export default ShareholderDashboard;
