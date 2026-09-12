import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Purchases from "./pages/Purchases";
import Expenses from "./pages/Expenses";
import "./App.css";

const navItems = [
  { label: "Dashboard", path: "/dashboard", roles: ["SUPER_MANAGER", "MANAGER", "SHAREHOLDER"] },
  { label: "Sales", path: "/sales", roles: ["SUPER_MANAGER", "MANAGER"] },
  { label: "Purchases", path: "/purchases", roles: ["SUPER_MANAGER", "MANAGER"] },
  { label: "Expenses", path: "/expenses", roles: ["SUPER_MANAGER", "MANAGER"] },
  { label: "Inventory", path: "/inventory", roles: ["SUPER_MANAGER", "MANAGER", "SHAREHOLDER"] },
  { label: "Products", path: "/products", roles: ["SUPER_MANAGER"] },
  { label: "Reports", path: "/reports", roles: ["SUPER_MANAGER", "MANAGER", "SHAREHOLDER"] },
  { label: "Users", path: "/users", roles: ["SUPER_MANAGER"] },
  { label: "Shops", path: "/shops", roles: ["SUPER_MANAGER"] },
];

const ComingSoon = ({ title, description }) => (
  <main className="app-page">
    <header className="page-header"><p className="eyebrow">MODULE</p><h1>{title}</h1><p>{description}</p></header>
    <section className="panel empty-module"><span>Next module</span><strong>{title}</strong><p>The navigation and access rules are ready. We'll connect this screen to the backend next.</p></section>
  </main>
);

const AppLayout = () => {
  const { user, logout } = useAuth();
  const items = navItems.filter((item) => item.roles.includes(user?.role));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark small">SM</div><div><strong>Shop Management</strong><small>Operations</small></div></div>
        <nav className="sidebar-nav">
          {items.map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-card"><strong>{user?.name}</strong><span>{user?.role?.replaceAll("_", " ")}</span></div>
          <button className="signout-button" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="app-main"><header className="mobile-topbar"><strong>Shop Management</strong><span>{user?.name}</span></header><Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/inventory" element={<ComingSoon title="Inventory" description="View current stock and stock movements." />} />
        <Route path="/products" element={<ComingSoon title="Products" description="Manage the product catalogue and selling prices." />} />
        <Route path="/reports" element={<ComingSoon title="Reports" description="Review daily and monthly shop performance." />} />
        <Route path="/users" element={<ComingSoon title="Users" description="Manage managers and shareholders." />} />
        <Route path="/shops" element={<ComingSoon title="Shops" description="Create shops and assign managers or shareholders." />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes></div>
    </div>
  );
};

const App = () => {
  const { user } = useAuth();
  return <Routes><Route path="/login" element={<Login />} /><Route element={<ProtectedRoute />}><Route path="/*" element={<AppLayout />} /></Route><Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} /></Routes>;
};

export default App;
