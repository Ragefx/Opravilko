import { Navigate, Outlet } from "react-router-dom";
import { useAuthStatus } from "../api/auth";
import Sidebar from "./Sidebar";

export default function Layout() {
  const { data, isLoading } = useAuthStatus();

  if (isLoading) return null;
  if (!data?.authenticated) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
