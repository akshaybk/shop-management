import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const emptyForm = { name: "", category: "", unit: "piece", sellingPrice: "" };

const Products = () => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadProducts = async () => {
    const response = await apiRequest("/products");
    setProducts(response.products || []);
  };

  useEffect(() => {
    loadProducts().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setForm({ name: product.name, category: product.category || "", unit: product.unit, sellingPrice: String(product.sellingPrice) });
    setError("");
    setSuccess("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!form.name.trim()) return setError("Product name is required.");
    const price = Number(form.sellingPrice);
    if (!Number.isFinite(price) || price < 0) return setError("Selling price must be zero or greater.");

    try {
      setSaving(true);
      const body = JSON.stringify({ name: form.name.trim(), category: form.category.trim(), unit: form.unit.trim() || "piece", sellingPrice: price });
      const response = editingId
        ? await apiRequest(`/products/${editingId}`, { method: "PATCH", body })
        : await apiRequest("/products", { method: "POST", body });
      setSuccess(response.message);
      reset();
      await loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product) => {
    setError("");
    setSuccess("");
    try {
      const response = await apiRequest(`/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ active: !product.active }) });
      setSuccess(response.message);
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="page-loading">Loading products...</div>;

  return (
    <main className="app-page">
      <header className="page-header"><div><p className="eyebrow">PRODUCTS</p><h1>Product catalogue</h1><p>Manage products and current selling prices. Only the Super Manager can change the catalogue.</p></div></header>
      {error && <div className="form-error page-message">{error}</div>}
      {success && <div className="form-success page-message">{success}</div>}
      <section className="content-grid">
        <div className="panel"><div className="panel-header"><h2>{editingId ? "Edit product" : "New product"}</h2>{editingId && <button className="signout-button" type="button" onClick={reset}>Cancel</button>}</div><form className="operation-form" onSubmit={submit}><label>Product name<input value={form.name} onChange={(e) => change("name", e.target.value)} placeholder="e.g. Rice" /></label><label>Category <span className="optional-label">(optional)</span><input value={form.category} onChange={(e) => change("category", e.target.value)} placeholder="e.g. Grocery" /></label><label>Unit<input value={form.unit} onChange={(e) => change("unit", e.target.value)} placeholder="e.g. kg" /></label><label>Selling price<input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => change("sellingPrice", e.target.value)} placeholder="e.g. 65" /></label><button className="primary-button" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create product"}</button></form></div>
        <div className="panel"><div className="panel-header"><h2>Products</h2><span>{products.length} total</span></div>{products.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Category</th><th>Unit</th><th>Selling price</th><th>Status</th><th>Action</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.category || "—"}</td><td>{product.unit}</td><td><strong>{money(product.sellingPrice)}</strong></td><td><span className={product.active ? "badge success" : "badge warning"}>{product.active ? "Active" : "Inactive"}</span></td><td><div className="row-actions"><button className="text-button" onClick={() => startEdit(product)}>Edit</button><button className="text-button" onClick={() => toggleActive(product)}>{product.active ? "Deactivate" : "Activate"}</button></div></td></tr>)}</tbody></table></div> : <p className="empty">No products created yet.</p>}</div>
      </section>
      <section className="panel info-panel"><strong>Important</strong><p>Changing a product's selling price affects future sales only. Each sale stores the selling price used at the time of sale, so historical reports remain accurate.</p></section>
    </main>
  );
};

export default Products;
