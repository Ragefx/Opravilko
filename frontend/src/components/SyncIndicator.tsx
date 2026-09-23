import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  discardPending,
  forceOverwrite,
  retrySave,
  subscribeSync,
  type SyncState,
  usingFirebase,
} from "../data/store";
import { CloudIcon, CloudOffIcon, RefreshIcon } from "./icons";

export default function SyncIndicator() {
  const [state, setState] = useState<SyncState>({ status: "idle", pending: false });
  const qc = useQueryClient();

  useEffect(() => subscribeSync(setState), []);

  if (state.status === "conflict") {
    return (
      <div className="sync-banner conflict">
        <CloudOffIcon width={14} height={14} />
        <span>Edited somewhere else since you opened this.</span>
        <button
          className="sync-banner-action"
          onClick={async () => {
            discardPending();
            await qc.invalidateQueries({ queryKey: ["bootstrap"] });
          }}
        >
          Load theirs
        </button>
        <button className="sync-banner-action" onClick={() => void forceOverwrite()}>
          Keep mine
        </button>
      </div>
    );
  }

  if (state.status === "offline") {
    return (
      <div className="sync-chip muted" title="Changes are kept on this device and upload when you're back online.">
        <CloudOffIcon width={13} height={13} />
        {state.pending ? "Offline · changes saved on this device" : "Offline"}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="sync-banner error">
        <CloudOffIcon width={14} height={14} />
        <span title={state.message}>{usingFirebase() ? state.message || "Couldn't save your changes." : "Couldn't save to Dropbox."}</span>
        {usingFirebase() ? (
          // A rejected Firebase write can't be retried as-is; the screen already shows the saved state.
          <button className="sync-banner-action" onClick={() => setState({ status: "idle", pending: false })}>
            OK
          </button>
        ) : (
          <button className="sync-banner-action" onClick={() => void retrySave()}>
            Retry
          </button>
        )}
      </div>
    );
  }

  if (state.status === "saving" || state.pending) {
    return (
      <div className="sync-chip">
        <RefreshIcon width={13} height={13} className="spin" />
        Saving…
      </div>
    );
  }

  if (state.status === "saved") {
    return (
      <div className="sync-chip muted">
        <CloudIcon width={13} height={13} />
        Saved
      </div>
    );
  }

  return null;
}
