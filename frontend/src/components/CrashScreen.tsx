import { Component, type ReactNode } from "react";

/**
 * If something on a page throws, show what happened and a way back, instead
 * of a blank screen.
 */
export default class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <b>Something went wrong</b>
        <p>Opravilko hit an error. Your tasks are safe; reloading usually fixes it.</p>
        <code>{error.message}</code>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
