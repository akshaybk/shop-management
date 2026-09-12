import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const Expenses = () => {
  const [shops, setShops] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [shopId, setShopId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("DAILY");
  const [expenseDate, setExpenseDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedShop = useMemo(() => shops.find((shop) => shop.id === Number(shopId)), [shops, shopId]);

  const loadExpenses = async (selectedShopId) => {
    if (!selectedShopId) return;
    const response = await apiRequest(`/expenses/shop/${selectedShopId}`);
    setExpenses(response.expenses || []);
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
  }, []);

  useEffect(() => {
    if (!shopId) return;
    setError("");
    loadExpenses(shopId).catch((err) => setError(err.message));
  }, [shopId]);

  const submitExpense = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const parsedAmount = Number(amount);
    if (!shopId || !category.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Select a shop, enter a category, and enter an amount greater than zero.");
      return;
    }

    try {
      setSaving(true);
      const body = {
        shopId: Number(shopId),
        category: category.trim(),
        description: description.trim(),
        amount: parsedAmount,
        frequency,
      };
      if (expenseDate) body.expenseDate = expenseDate;
      const response = await apiRequest("/expenses", { method: "POST", body: JSON.stringify(body) });
      setSuccess(`${response.message}. ${frequency === "DAILY" ? "Daily" : "Monthly"} expense of ${money(parsedAmount)} recorded for ${selectedShop?.name || "the shop"}.`);
      setCategory("");
      setDescription("");
      setAmount("");
      setExpenseDate("");
      await loadExpenses(shopId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-loading">Loading expenses...</div>;

  return (
    <main className="app-page">
      <header className="page-header"><div><p className="eyebrow">EXPENSES</p><h1>Record an expense</h1><p>Track daily and monthly operating expenses. Recorded expenses reduce the shop balance.</p></div></header>
      {error && <div className="form-error page-message">{error}</div>}
      {success && <div className="form-success page-message">{success}</div>}
      <section className="content-grid expenses-grid">
        <div className="panel">
          <div className="panel-header"><h2>New expense</h2><span>Balance updates automatically</span></div>
          {!shops.length ? <p className="empty">No shop is assigned to your account.</p> : (
            <form className="operation-form" onSubmit={submitExpense}>
              <label>Shop<select value={shopId} onChange={(event) => setShopId(event.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}{shop.location ? ` — ${shop.location}` : ""}</option>)}</select></label>
              <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Electricity" /></label>
              <label>Description <span className="optional-label">(optional)</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. September electricity bill" /></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 1500" /></label>
              <label>Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="DAILY">Daily</option><option value="MONTHLY">Monthly</option></select></label>
              <label>Expense date <span className="optional-label">(optional)</span><input type="datetime-local" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Recording..." : "Record expense"}</button>
            </form>
          )}
        </div>
        <div className="panel">
          <div className="panel-header"><h2>Expense history</h2><span>{expenses.length} shown</span></div>
          {expenses.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Category</th><th>Type</th><th>Amount</th><th>Date</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td><strong>{expense.category}</strong><small>{expense.description || "No description"}</small></td><td><span className="badge">{expense.frequency}</span></td><td><strong>{money(expense.amount)}</strong></td><td>{new Date(expense.expenseDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div> : <p className="empty">No expenses recorded for this shop yet.</p>}
        </div>
      </section>
    </main>
  );
};

export default Expenses;
