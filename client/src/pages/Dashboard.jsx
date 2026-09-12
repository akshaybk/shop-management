import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const Stat = ({ label, value }) => <article className="stat-card"><span>{label}</span><strong>{value}</strong></article>;

const Dashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        if (user.role === "SUPER_MANAGER") {
          const response = await apiRequest("/dashboard");
          setData({ mode: "overall", ...response.data });
        } else if (user.role === "SHAREHOLDER") {
          const response = await apiRequest("/shareholder/dashboard");
          setData({ mode: "shareholder", ...response.data });
        } else {
          const shopsResponse = await apiRequest("/dashboard/my-shops");
          const shops = shopsResponse.data || [];
          if (!shops.length) throw new Error("No shop is assigned to your account");
          const response = await apiRequest(`/dashboard/shop/${shops[0].id}`);
          setData({ mode: "shop", ...response.data });
        }
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    };
    load();
  }, [user]);

  if (loading) return <div className="page-loading">Loading dashboard...</div>;
  if (error) return <main className="dashboard-page"><div className="form-error">{error}</div></main>;

  if (data.mode === "overall") return (
    <main className="dashboard-page">
      <header className="page-header"><div><p className="eyebrow">OVERVIEW</p><h1>Good day, {user.name}</h1><p>Performance across your active shops.</p></div></header>
      <section className="stats-grid"><Stat label="Active shops" value={data.shopCount} /><Stat label="Current balance" value={money(data.totals.currentBalance)} /><Stat label="Total sales" value={money(data.totals.totalSales)} /><Stat label="Total expenses" value={money(data.totals.totalExpenses)} /></section>
      <section className="panel"><div className="panel-header"><h2>Shop performance</h2><span>{data.shopCount} active</span></div>{data.shops.map((shop) => <div className="shop-row" key={shop.id}><div><strong>{shop.name}</strong><small>{shop.location || "No location"}</small></div><div><strong>{money(shop.currentBalance)}</strong><small>Balance</small></div><div><strong>{money(shop.todaySales)}</strong><small>Today's sales</small></div><div><strong>{shop.lowStockItems}</strong><small>Low stock</small></div></div>)}</section>
    </main>
  );

  if (data.mode === "shareholder") return (
    <main className="dashboard-page">
      <header className="page-header"><div><p className="eyebrow">SHAREHOLDER VIEW</p><h1>Welcome, {user.name}</h1><p>Read-only overview of the shops in which you hold an ownership stake.</p></div></header>
      <section className="stats-grid"><Stat label="Shops" value={data.shops.length} /><Stat label="Combined balance" value={money(data.shops.reduce((sum, item) => sum + item.financial.currentBalance, 0))} /><Stat label="Combined sales" value={money(data.shops.reduce((sum, item) => sum + item.financial.totalSales, 0))} /><Stat label="Combined expenses" value={money(data.shops.reduce((sum, item) => sum + item.financial.totalExpenses, 0))} /></section>
      {data.shops.map((item) => <section className="panel shareholder-card" key={item.shop.id}><div className="panel-header"><div><h2>{item.shop.name}</h2><span>{item.shop.location || "No location"}</span></div><span className="stake-badge">{item.stakePercentage == null ? "Stake not set" : `${item.stakePercentage}% ownership`}</span></div><section className="stats-grid shareholder-mini-stats"><Stat label="Current balance" value={money(item.financial.currentBalance)} /><Stat label="Total sales" value={money(item.financial.totalSales)} /><Stat label="Purchases" value={money(item.financial.totalPurchases)} /><Stat label="Expenses" value={money(item.financial.totalExpenses)} /></section><div className="panel-header"><h2>Current inventory</h2><span>{item.inventory.length} products</span></div>{item.inventory.length ? item.inventory.map((stock) => <div className="inventory-row" key={stock.productId}><div><strong>{stock.productName}</strong><small>{money(stock.sellingPrice)} / {stock.unit}</small></div><span className={stock.lowStock ? "badge warning" : "badge"}>{stock.quantity} {stock.unit}{stock.lowStock ? " · Low" : ""}</span></div>) : <p className="empty">No inventory yet.</p>}</section>)}
    </main>
  );

  return (
    <main className="dashboard-page"><header className="page-header"><div><p className="eyebrow">SHOP DASHBOARD</p><h1>{data.shop.name}</h1><p>{data.shop.location || "Shop overview"}</p></div></header><section className="stats-grid"><Stat label="Current balance" value={money(data.financial.currentBalance)} /><Stat label="Today's sales" value={money(data.today.sales)} /><Stat label="Today's expenses" value={money(data.today.expenses)} /><Stat label="Today's net change" value={money(data.today.netChange)} /></section><section className="content-grid"><div className="panel"><div className="panel-header"><h2>Inventory</h2><span>{data.inventory.length} products</span></div>{data.inventory.length ? data.inventory.map((item) => <div className="inventory-row" key={item.productId}><div><strong>{item.productName}</strong><small>{money(item.sellingPrice)} / {item.unit}</small></div><span className={item.lowStock ? "badge warning" : "badge"}>{item.quantity} {item.unit}{item.lowStock ? " · Low" : ""}</span></div>) : <p className="empty">No inventory yet.</p>}</div><div className="panel"><div className="panel-header"><h2>Recent transactions</h2></div>{data.recentTransactions.length ? data.recentTransactions.map((item) => <div className="transaction-row" key={`${item.type}-${item.id}`}><div><strong>{item.type}</strong><small>{item.productName || item.category}</small></div><strong>{money(item.amount)}</strong></div>) : <p className="empty">No recent transactions.</p>}</div></section></main>
  );
};
export default Dashboard;
