import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { isConnected } from "../dropbox/auth";
import Sidebar from "./Sidebar";
import SearchModal from "./SearchModal";

export default function Layout() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!isConnected()) return <Navigate to="/connect" replace />;

  return (
    <div className="app-shell">
      <Sidebar onSearch={() => setSearchOpen(true)} />
      <main className="main">
        <Outlet />
      </main>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
