import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

const Reports = () => {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [mode, setMode] = useState("daily");
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/dashboard/my-shops")
      .then((response) => {
        const available = response.data || [];
        setShops(available);
        if (available.length) setShopId(String(available[0].id));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const loadReport = async () => {
    if (!shopId) return;
    setError("");
    setReportLoading(true);
    try {
      const endpoint = mode === "daily" ? `/reports/daily/${shopId}?date=${date}` : `/reports/monthly/${shopId}?month=${month}`;
      const response = await apiRequest(endpoint);
      setReport(response.report);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (shopId) loadReport();
  }, [shopId, mode]);

  const expenseTotal = report?.expenses || 0;
  const netChange = report ? Number(report.closingBalance) - Number(report.openingBalance) : 0;
  const stockUnits = useMemo(() => (report?.inventory || []).reduce((sum, item) => sum + Number(item.closingStock || 0), 0), [report]);

  if (loading) return <div className="page-loading">Loading reports...</div>;

  return (
    <main className="app-page">
      <header className="page-header"><div><p className="eyebrow">REPORTS</p><h1>Business reports</h1><p>Review shop performance and reconcile the balance across sales, purchases, and expenses.</p></div></header>
      {error && <div className="form-error page-message">{error}</div>}
      {!shops.length ? <section className="panel"><p className="empty">No shop is assigned to your account.</p></section> : <>
        <section className="panel report-controls"><label>Shop<select value={shopId} onChange={(e) => setShopId(e.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}{shop.location ? ` — ${shop.location}` : ""}</option>)}</select></label><div className="segmented"><button className={mode === "daily" ? "selected" : ""} onClick={() => setMode("daily")}>Daily</button><button className={mode === "monthly" ? "selected" : ""} onClick={() => setMode("monthly")}>Monthly</button></div>{mode === "daily" ? <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label> : <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>}<button className="primary-button compact" onClick={loadReport} disabled={reportLoading}>{reportLoading ? "Loading..." : "Generate report"}</button></section>
        {report && <>
          <section className="stats-grid report-stats"><article className="stat-card"><span>Opening balance</span><strong>{money(report.openingBalance)}</strong></article><article className="stat-card"><span>Sales</span><strong>{money(report.sales.amount)}</strong><small>{report.sales.quantity} units sold</small></article><article className="stat-card"><span>Purchases</span><strong>{money(report.purchases.amount)}</strong><small>{report.purchases.quantity} units purchased</small></article><article className="stat-card"><span>Expenses</span><strong>{money(expenseTotal)}</strong></article></section>
          <section className="panel balance-panel"><div><span className="eyebrow">CLOSING BALANCE</span><h2>{money(report.closingBalance)}</h2><p>{netChange >= 0 ? "Net increase" : "Net decrease"} of <strong>{money(Math.abs(netChange))}</strong> for this {mode === "daily" ? "day" : "month"}.</p></div><div className="reconciliation"><span>Opening</span><b>{money(report.openingBalance)}</b><span>+ Sales</span><b>{money(report.sales.amount)}</b><span>− Purchases</span><b>{money(report.purchases.amount)}</b><span>− Expenses</span><b>{money(expenseTotal)}</b><hr /><span>Closing</span><b>{money(report.closingBalance)}</b></div></section>
          <section className="content-grid"><div className="panel"><div className="panel-header"><h2>Expense breakdown</h2><span>{Object.values(report.expenseBreakdown || {}).reduce((sum, item) => sum + item.count, 0)} transactions</span></div>{Object.keys(report.expenseBreakdown || {}).length ? <div className="breakdown-list">{Object.entries(report.expenseBreakdown).map(([type, item]) => <div className="breakdown-row" key={type}><span>{type}</span><strong>{money(item.amount)}</strong><small>{item.count} transaction{item.count === 1 ? "" : "s"}</small></div>)}</div> : <p className="empty">No expenses in this period.</p>}</div><div className="panel"><div className="panel-header"><h2>Inventory movement</h2><span>{stockUnits.toLocaleString("en-IN")} units closing</span></div>{report.inventory?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Opening</th><th>Purchased</th><th>Sold</th><th>Adjustment</th><th>Closing</th></tr></thead><tbody>{report.inventory.map((item) => <tr key={item.productId}><td><strong>{item.productName}</strong><small>{item.unit}</small></td><td>{item.openingStock}</td><td>{item.purchased}</td><td>{item.sold}</td><td>{item.adjustment > 0 ? `+${item.adjustment}` : item.adjustment}</td><td><strong>{item.closingStock}</strong></td></tr>)}</tbody></table></div> : <p className="empty">No inventory movements in this period.</p>}</div></section>
          <section className="panel"><div className="panel-header"><h2>Expense transactions</h2><span>{report.expenseTransactions?.length || 0}</span></div>{report.expenseTransactions?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Category</th><th>Description</th><th>Type</th><th>Amount</th><th>Date</th></tr></thead><tbody>{report.expenseTransactions.map((expense) => <tr key={expense.id}><td>{expense.category}</td><td>{expense.description || "—"}</td><td><span className="badge">{expense.frequency}</span></td><td><strong>{money(expense.amount)}</strong></td><td>{new Date(expense.expenseDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div> : <p className="empty">No expense transactions in this period.</p>}</section>
        </>}
      </>}
    </main>
  );
};

export default Reports;
