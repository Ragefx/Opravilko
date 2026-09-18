import { Navigate, Outlet } from "react-router-dom";
import { isConnected } from "../dropbox/auth";
import Sidebar from "./Sidebar";

export default function Layout() {
  if (!isConnected()) return <Navigate to="/connect" replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
