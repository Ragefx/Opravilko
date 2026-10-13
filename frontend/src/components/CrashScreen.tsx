import { tr } from "../i18n";
import { Component, type ReactNode } from "react";
import { logError } from "../utils/errorLog";

/**
 * If something on a page throws, show what happened and a way back, instead
 * of a blank screen.
 */
export default class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Kept for Settings > About, so it can be looked at afterwards.
    logError(error, "crash");
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <b>{tr("Something went wrong", "Nekaj je šlo narobe")}</b>
        <p>{tr("Opravilko hit an error. Your tasks are safe; reloading usually fixes it.", "Opravilko je naletel na napako. Naloge so varne; ponovno nalaganje običajno pomaga.")}</p>
        <code>{error.message}</code>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          {tr("Reload", "Naloži znova")}
        </button>
      </div>
    );
  }
}
