import { useState } from "react";
import type { Project } from "../api/types";
import { activeSession } from "../data/store";
import { ShareError } from "../firebase/sync";
import { useToast } from "./ToastProvider";

/**
 * Who a project is shared with. The owner adds people by email (they need
 * to have signed in once) and can remove them; anyone else can leave.
 */
export default function ShareModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const session = activeSession();
  const showToast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;
  const me = session.userId;
  const isOwner = project.ownerId === me;
  const members = (project.members || []).map((uid) => ({
    uid,
    profile: project.memberProfiles?.[uid],
  }));

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await session!.shareProject(project.id, email);
      showToast({ message: `Shared “${project.name}” with ${profile.name}` });
      setEmail("");
    } catch (err) {
      setError(err instanceof ShareError ? err.message : "Couldn't share. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share “{project.name}”</h3>
        <p className="share-note">
          Everyone here sees and edits the project's tasks, and changes show up for all of them right away.
        </p>

        <div className="share-members">
          {members.map(({ uid, profile }) => (
            <div key={uid} className="share-member">
              <span className="share-avatar" aria-hidden="true">
                {profile?.photo ? <img src={profile.photo} alt="" referrerPolicy="no-referrer" /> : (profile?.name || "?")[0].toUpperCase()}
              </span>
              <span className="share-member-text">
                <b>
                  {uid === me ? "You" : profile?.name || "Someone"}
                  {uid === project.ownerId && <span className="share-owner"> · owner</span>}
                </b>
                {profile?.email && <span>{profile.email}</span>}
              </span>
              {isOwner && uid !== me && (
                <button
                  className="btn btn-text"
                  onClick={() => void session.unshareProject(project.id, uid).catch(() => setError("Couldn't remove them."))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {isOwner ? (
          <form
            className="share-add"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              placeholder="Their Google email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email to share with"
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Sharing…" : "Share"}
            </button>
          </form>
        ) : (
          <p className="share-note">Only the owner can add or remove people.</p>
        )}
        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-text" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
