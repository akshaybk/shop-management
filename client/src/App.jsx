import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import "./App.css";

const App = () => {
  const { user, logout } = useAuth();

  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/dashboard" element={<><header className="topbar"><div className="brand">Shop Management</div><div className="user-area"><span>{user?.name}</span><button onClick={logout}>Sign out</button></div></header><Dashboard /></>} />
    </Route>
    <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
  </Routes>;
};

export default App;
