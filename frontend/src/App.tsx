import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Layout from "./components/Layout";
import Connect from "./pages/Connect";
import Today from "./pages/Today";
import Upcoming from "./pages/Upcoming";
import CompletedView from "./pages/CompletedView";
import StatsView from "./pages/StatsView";
import ProjectView from "./pages/ProjectView";
import InboxCalendar from "./pages/InboxCalendar";
import LabelView from "./pages/LabelView";
import FilterView from "./pages/FilterView";
import Setup from "./pages/Setup";
import MidvaView from "./pages/MidvaView";
import { isSignedIn } from "./data/store";
import Home from "./pages/Home";
import { App as NativeApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  NATIVE_OAUTH_CALLBACK,
  NATIVE_OAUTH_STATE,
  completeConnect,
  isNativeApp,
} from "./dropbox/auth";
import { parseWidgetLink, requestQuickAdd } from "./native/widget";

/**
 * Dropbox redirects back to the site root with ?code=... (or ?error=...) in the
 * query string, ahead of our hash-based routing. This catches that once on boot,
 * completes the token exchange, then cleans the URL and hands off to the router.
 */
function useOAuthCallback() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forwardUrl, setForwardUrl] = useState<string | null>(null);
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

    // A sign-in started in the Android app lands on the website (the redirect
    // URI Dropbox knows); hand the code back to the app instead of using it here.
    if (!isNativeApp && params.get("state") === NATIVE_OAUTH_STATE) {
      const query = code ? `code=${encodeURIComponent(code)}` : `error=${encodeURIComponent(oauthError!)}`;
      const target = /android/i.test(navigator.userAgent)
        ? `intent://oauth?${query}#Intent;scheme=opravilko;package=com.opravilko.app;end`
        : `${NATIVE_OAUTH_CALLBACK}?${query}`;
      setForwardUrl(target);
      setReady(true);
      window.location.replace(target);
      return;
    }

    if (oauthError) {
      setError(oauthError);
      setReady(true);
      return;
    }

    completeConnect(code!)
      .then(() => {
        navigate("/app", { replace: true });
      })
      .catch((err) => {
        setError(err?.message || "Failed to connect to Dropbox.");
      })
      .finally(() => setReady(true));
  }, [navigate]);

  return { ready, error, forwardUrl };
}

/**
 * In the Android app, Dropbox sign-in finishes in the system browser, which
 * reopens the app via opravilko://oauth?code=...; complete the sign-in here.
 */
function useNativeOAuthReturn(onError: (message: string) => void) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNativeApp) return;
    const listener = NativeApp.addListener("appUrlOpen", async ({ url }) => {
      if (!url.startsWith(NATIVE_OAUTH_CALLBACK)) {
        handleWidgetLink(url);
        return;
      }
      void Browser.close().catch(() => {});
      const params = new URL(url).searchParams;
      const code = params.get("code");
      if (!code) {
        onError(params.get("error") || "Dropbox sign-in was cancelled.");
        return;
      }
      try {
        await completeConnect(code);
        navigate("/app", { replace: true });
      } catch (err: any) {
        onError(err?.message || "Failed to connect to Dropbox.");
      }
    });
    // Cold start from a widget tap: the link arrives as the launch URL instead.
    void NativeApp.getLaunchUrl().then((launch) => {
      if (launch?.url && !launch.url.startsWith(NATIVE_OAUTH_CALLBACK)) handleWidgetLink(launch.url);
    });

    function handleWidgetLink(url: string) {
      const link = parseWidgetLink(url);
      if (!link || !isSignedIn()) return;
      if ("route" in link) {
        navigate(link.route);
        return;
      }
      if (!window.location.hash.startsWith("#/app")) navigate("/app");
      requestQuickAdd(link.quickAdd);
    }

    return () => {
      void listener.then((l) => l.remove());
    };
  }, [navigate, onError]);
}

/** Shown on the website while it hands a sign-in back to the Android app. */
function ReturnToApp({ url }: { url: string }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Opravilko</h1>
        <p>Dropbox is connected. Returning you to the app…</p>
        <a className="btn btn-primary" href={url}>
          Open Opravilko
        </a>
      </div>
    </div>
  );
}

/** /app opens on the look's home: Now / Next / Later in Soča, Today in classic. */
function HomeRedirect() {
  return <Navigate to="home" replace />;
}

export default function App() {
  const { ready, error, forwardUrl } = useOAuthCallback();
  const [nativeError, setNativeError] = useState<string | null>(null);
  const navigate = useNavigate();
  const handleNativeError = useCallback(
    (message: string) => {
      setNativeError(message);
      navigate("/connect", { replace: true });
    },
    [navigate]
  );
  useNativeOAuthReturn(handleNativeError);

  if (!ready) return null;
  if (forwardUrl) return <ReturnToApp url={forwardUrl} />;

  return (
    <Routes>
      <Route path="/connect" element={<Connect key={nativeError ?? ""} initialError={nativeError ?? error} />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="home" element={<Home />} />
        <Route path="midva" element={<MidvaView />} />
        <Route path="today" element={<Today />} />
        <Route path="upcoming" element={<Upcoming />} />
        <Route path="completed" element={<CompletedView />} />
        <Route path="stats" element={<StatsView />} />
        <Route path="inbox" element={<ProjectView />} />
        <Route path="calendar" element={<InboxCalendar />} />
        <Route path="project/:id" element={<ProjectView />} />
        <Route path="label/:name" element={<LabelView />} />
        <Route path="filter/:id" element={<FilterView />} />
      </Route>
      <Route path="*" element={<Navigate to={isSignedIn() ? "/app" : "/connect"} replace />} />
    </Routes>
  );
}
