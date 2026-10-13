import { tr } from "../i18n";
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
        <span>{tr("Edited somewhere else since you opened this.", "Odkar si to odprl(a), je bilo urejeno drugje.")}</span>
        <button
          className="sync-banner-action"
          onClick={async () => {
            discardPending();
            await qc.invalidateQueries({ queryKey: ["bootstrap"] });
          }}
        >
          {tr("Load theirs", "Naloži njihovo")}
        </button>
        <button className="sync-banner-action" onClick={() => void forceOverwrite()}>
          {tr("Keep mine", "Obdrži moje")}
        </button>
      </div>
    );
  }

  if (state.status === "offline") {
    return (
      <div className="sync-chip muted" title={tr("Changes are kept on this device and upload when you're back online.", "Spremembe so shranjene na tej napravi in se naložijo, ko boš spet na spletu.")}>
        <CloudOffIcon width={13} height={13} />
        {state.pending ? tr("Offline · changes saved on this device", "Brez povezave · spremembe shranjene na tej napravi") : tr("Offline", "Brez povezave")}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="sync-banner error">
        <CloudOffIcon width={14} height={14} />
        <span title={state.message}>{usingFirebase()
          ? state.message || tr("Couldn't save your changes.", "Sprememb ni bilo mogoče shraniti.")
          : tr("Couldn't save to Dropbox.", "Shranjevanje v Dropbox ni uspelo.")}</span>
        {usingFirebase() ? (
          // A rejected Firebase write can't be retried as-is; the screen already shows the saved state.
          <button className="sync-banner-action" onClick={() => setState({ status: "idle", pending: false })}>
            {tr("OK", "V redu")}
          </button>
        ) : (
          <button className="sync-banner-action" onClick={() => void retrySave()}>
            {tr("Retry", "Poskusi znova")}
          </button>
        )}
      </div>
    );
  }

  if (state.status === "saving" || state.pending) {
    return (
      <div className="sync-chip">
        <RefreshIcon width={13} height={13} className="spin" />
        {tr("Saving…", "Shranjujem …")}
      </div>
    );
  }

  if (state.status === "saved") {
    return (
      <div className="sync-chip muted">
        <CloudIcon width={13} height={13} />
        {tr("Saved", "Shranjeno")}
      </div>
    );
  }

  return null;
}
