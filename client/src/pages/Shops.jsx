import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function Shops() {
  const [shops, setShops] = useState([]);
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState({ name: "", location: "", openingBalance: "" });
  const [assignment, setAssignment] = useState({ shopId: "", managerId: "", shareholderId: "", stakePercentage: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [shopResponse, userResponse] = await Promise.all([apiRequest("/shops"), apiRequest("/users")]);
    setShops(shopResponse.shops || []);
    setPeople(userResponse.users || []);
  };

  useEffect(() => { load().catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);

  const createShop = async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await apiRequest("/shops", { method: "POST", body: { ...form, openingBalance: Number(form.openingBalance || 0) } });
      setForm({ name: "", location: "", openingBalance: "" }); await load(); setMessage("Shop created successfully.");
    } catch (err) { setError(err.message); }
  };

  const assign = async (event, type) => {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const body = type === "managers"
        ? { managerId: Number(assignment.managerId) }
        : { shareholderId: Number(assignment.shareholderId), stakePercentage: assignment.stakePercentage === "" ? undefined : Number(assignment.stakePercentage) };
      await apiRequest(`/shops/${assignment.shopId}/${type}`, { method: "POST", body });
      await load(); setMessage(`${type === "managers" ? "Manager" : "Shareholder"} assigned.`);
    } catch (err) { setError(err.message); }
  };

  const remove = async (shopId, type, id) => {
    try { await apiRequest(`/shops/${shopId}/${type}/${id}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err.message); }
  };

  if (loading) return <div className="page-loading">Loading shops...</div>;
  const managers = people.filter((p) => p.role === "MANAGER" && p.active);
  const shareholders = people.filter((p) => p.role === "SHAREHOLDER" && p.active);

  return <main className="app-page">
    <header className="page-header"><p className="eyebrow">SHOP MANAGEMENT</p><h1>Shops</h1><p>Create shops and assign managers and shareholders.</p></header>
    {error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}
    <section className="content-grid">
      <form className="panel operation-form" onSubmit={createShop}><div className="panel-header"><h2>New shop</h2></div><label>Shop name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label><label>Opening balance<input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></label><button>Create shop</button></form>
      <section className="panel"><div className="panel-header"><h2>Assign manager</h2></div><form className="operation-form" onSubmit={(e) => assign(e, "managers")}><label>Shop<select required value={assignment.shopId} onChange={(e) => setAssignment({ ...assignment, shopId: e.target.value })}><option value="">Select shop</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Manager<select required value={assignment.managerId} onChange={(e) => setAssignment({ ...assignment, managerId: e.target.value })}><option value="">Select manager</option>{managers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button>Assign manager</button></form></section>
    </section>
    <section className="panel"><div className="panel-header"><h2>Shareholder assignments</h2></div><form className="operation-form" onSubmit={(e) => assign(e, "shareholders")}><label>Shop<select required value={assignment.shopId} onChange={(e) => setAssignment({ ...assignment, shopId: e.target.value })}><option value="">Select shop</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Shareholder<select required value={assignment.shareholderId} onChange={(e) => setAssignment({ ...assignment, shareholderId: e.target.value })}><option value="">Select shareholder</option>{shareholders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Ownership %<input type="number" min="0" max="100" step="0.01" value={assignment.stakePercentage} onChange={(e) => setAssignment({ ...assignment, stakePercentage: e.target.value })} /></label><button>Assign shareholder</button></form></section>
    <section className="panel"><div className="panel-header"><h2>All shops</h2><span>{shops.length}</span></div>{shops.map((shop) => <article className="shop-management-card" key={shop.id}><h3>{shop.name}</h3><small>{shop.location || "No location"} · Opening balance {money(shop.openingBalance)}</small><div className="assignment-columns"><div><strong>Managers</strong>{shop.managers.map((m) => <div className="assignment-row" key={m.id}><span>{m.name}</span><button onClick={() => remove(shop.id, "managers", m.id)}>Remove</button></div>)}</div><div><strong>Shareholders</strong>{shop.shareholders.map((s) => <div className="assignment-row" key={s.id}><span>{s.name} — {s.stakePercentage ?? "?"}%</span><button onClick={() => remove(shop.id, "shareholders", s.id)}>Remove</button></div>)}</div></div></article>)}</section>
  </main>;
}
