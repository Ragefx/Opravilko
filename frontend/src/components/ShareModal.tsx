import { tr } from "../i18n";
import { useState } from "react";
import type { Project } from "../api/types";
import { activeSession } from "../data/store";
import { ShareError } from "../firebase/sync";
import { useToast } from "./ToastProvider";
import { useBootstrap } from "../api/hooks";

/**
 * Who a project is shared with. The owner adds people by email (they need
 * to have signed in once) and can remove them; anyone else can leave.
 */
export default function ShareModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const session = activeSession();
  const { data } = useBootstrap();
  const partner = data?.partner;
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
      showToast({ message: tr(`Shared “${project.name}” with ${profile.name}`, `»${project.name}« deljeno z ${profile.name}`) });
      setEmail("");
    } catch (err) {
      setError(err instanceof ShareError ? err.message : tr("Couldn't share. Check your connection and try again.", "Deljenje ni uspelo. Preveri povezavo in poskusi znova."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tr(`Share “${project.name}”`, `Deli »${project.name}«`)}</h3>
        <p className="share-note">
          {tr("Everyone here sees and edits the project's tasks, and changes show up for all of them right away.", "Vsi tukaj vidijo in urejajo naloge projekta, spremembe pa se vsem takoj pokažejo.")}
        </p>

        <div className="share-members">
          {members.map(({ uid, profile }) => (
            <div key={uid} className="share-member">
              <span className="share-avatar" aria-hidden="true">
                {profile?.photo ? <img src={profile.photo} alt="" referrerPolicy="no-referrer" /> : (profile?.name || "?")[0].toUpperCase()}
              </span>
              <span className="share-member-text">
                <b>
                  {uid === me ? tr("You", "Ti") : profile?.name || tr("Someone", "Nekdo")}
                  {uid === project.ownerId && <span className="share-owner">{tr(" · owner", " · lastnik")}</span>}
                </b>
                {profile?.email && <span>{profile.email}</span>}
              </span>
              {isOwner && uid !== me && (
                <button
                  className="btn btn-text"
                  onClick={() => void session.unshareProject(project.id, uid).catch(() => setError(tr("Couldn't remove them.", "Odstranitev ni uspela.")))}
                >
                  {tr("Remove", "Odstrani")}
                </button>
              )}
            </div>
          ))}
        </div>

        {isOwner && partner && !project.members?.includes(partner.uid) && (
          <button
            className="btn btn-primary share-partner"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await session.shareProject(project.id, partner.email);
                showToast({ message: tr(`Shared “${project.name}” with ${partner.name}`, `»${project.name}« deljeno z ${partner.name}`) });
              } catch (err) {
                setError(err instanceof ShareError ? err.message : tr("Couldn't share. Check your connection and try again.", "Deljenje ni uspelo. Preveri povezavo in poskusi znova."));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr(`Share with ${partner.name.split(" ")[0]}`, `Deli z ${partner.name.split(" ")[0]}`)}
          </button>
        )}

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
              placeholder={tr("Their Google email address", "Njihov Googlov e-poštni naslov")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label={tr("Email to share with", "E-pošta za deljenje")}
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? tr("Sharing…", "Delim …") : tr("Share", "Deli")}
            </button>
          </form>
        ) : (
          <p className="share-note">{tr("Only the owner can add or remove people.", "Ljudi lahko doda ali odstrani le lastnik.")}</p>
        )}
        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-text" onClick={onClose}>
            {tr("Done", "Končano")}
          </button>
        </div>
      </div>
    </div>
  );
}
