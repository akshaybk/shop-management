import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";
import { useAuth } from "../context/AuthContext";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const Stat = ({ label, value, detail }) => (
  <article className="stat-card">
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </article>
);

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
        } else {
          const response = await apiRequest("/shops");
          const shops = response.data || [];
          if (!shops.length) throw new Error("No shop is assigned to your account");
          const shopId = shops[0].id;
          const dashboard = await apiRequest(`/dashboard/shop/${shopId}`);
          setData({ mode: "shop", ...dashboard.data });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (loading) return <div className="page-loading">Loading dashboard...</div>;
  if (error) return <div className="dashboard-page"><div className="form-error">{error}</div></div>;

  if (data.mode === "overall") {
    return (
      <main className="dashboard-page">
        <header className="page-header">
          <div><p className="eyebrow">OVERVIEW</p><h1>Good day, {user.name}</h1><p>Here is the performance across your active shops.</p></div>
        </header>
        <section className="stats-grid">
          <Stat label="Active shops" value={data.shopCount} />
          <Stat label="Current balance" value={money(data.totals.currentBalance)} />
          <Stat label="Total sales" value={money(data.totals.totalSales)} />
          <Stat label="Total expenses" value={money(data.totals.totalExpenses)} />
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Shop performance</h2><span>{data.shopCount} active</span></div>
          <div className="shop-list">
            {data.shops.map((shop) => (
              <div className="shop-row" key={shop.id}>
                <div><strong>{shop.name}</strong><small>{shop.location || "No location"}</small></div>
                <div><strong>{money(shop.currentBalance)}</strong><small>Balance</small></div>
                <div><strong>{money(shop.todaySales)}</strong><small>Today's sales</small></div>
                <div><strong>{shop.lowStockItems}</strong><small>Low stock</small></div>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <header className="page-header">
        <div><p className="eyebrow">SHOP DASHBOARD</p><h1>{data.shop.name}</h1><p>{data.shop.location || "Shop overview"}</p></div>
      </header>
      <section className="stats-grid">
        <Stat label="Current balance" value={money(data.financial.currentBalance)} />
        <Stat label="Today's sales" value={money(data.today.sales)} />
        <Stat label="Today's expenses" value={money(data.today.expenses)} />
        <Stat label="Today's net change" value={money(data.today.netChange)} />
      </section>
      <section className="content-grid">
        <div className="panel"><div className="panel-header"><h2>Inventory</h2><span>{data.inventory.length} products</span></div>
          {data.inventory.length ? data.inventory.map((item) => <div className="inventory-row" key={item.productId}><div><strong>{item.productName}</strong><small>{money(item.sellingPrice)} / {item.unit}</small></div><span className={item.lowStock ? "badge warning" : "badge"}>{item.quantity} {item.unit}</span></div>) : <p className="empty">No inventory yet.</p>}
        </div>
        <div className="panel"><div className="panel-header"><h2>Recent transactions</h2></div>
          {data.recentTransactions.length ? data.recentTransactions.map((item) => <div className="transaction-row" key={`${item.type}-${item.id}`}><div><strong>{item.type}</strong><small>{item.productName || item.category}</small></div><strong>{money(item.amount)}</strong></div>) : <p className="empty">No recent transactions.</p>}
        </div>
      </section>
    </main>
  );
};

export default Dashboard;
