import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Layout from "./components/Layout";
import Connect from "./pages/Connect";
import Today from "./pages/Today";
import Upcoming from "./pages/Upcoming";
import CompletedView from "./pages/CompletedView";
import StatsView from "./pages/StatsView";
import ProjectView from "./pages/ProjectView";
import LabelView from "./pages/LabelView";
import FilterView from "./pages/FilterView";
import { completeConnect, isConnected } from "./dropbox/auth";

/**
 * Dropbox redirects back to the site root with ?code=... (or ?error=...) in the
 * query string, ahead of our hash-based routing. This catches that once on boot,
 * completes the token exchange, then cleans the URL and hands off to the router.
 */
function useOAuthCallback() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error_description") || params.get("error");

    if (!code && !oauthError) {
      setReady(true);
      return;
    }

    window.history.replaceState({}, "", window.location.pathname + window.location.hash);

    if (oauthError) {
      setError(oauthError);
      setReady(true);
      return;
    }

    completeConnect(code!)
      .then(() => {
        navigate("/app/today", { replace: true });
      })
      .catch((err) => {
        setError(err?.message || "Failed to connect to Dropbox.");
      })
      .finally(() => setReady(true));
  }, [navigate]);

  return { ready, error };
}

export default function App() {
  const { ready, error } = useOAuthCallback();

  if (!ready) return null;

  return (
    <Routes>
      <Route path="/connect" element={<Connect initialError={error} />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Navigate to="today" replace />} />
        <Route path="today" element={<Today />} />
        <Route path="upcoming" element={<Upcoming />} />
        <Route path="completed" element={<CompletedView />} />
        <Route path="stats" element={<StatsView />} />
        <Route path="inbox" element={<ProjectView />} />
        <Route path="project/:id" element={<ProjectView />} />
        <Route path="label/:name" element={<LabelView />} />
        <Route path="filter/:id" element={<FilterView />} />
      </Route>
      <Route path="*" element={<Navigate to={isConnected() ? "/app/today" : "/connect"} replace />} />
    </Routes>
  );
}
