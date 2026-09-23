import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { nanoid } from "nanoid";
import { firestore } from "./app";

const newId = () => nanoid();
import type {
  AppData,
  CalendarEvent,
  CalendarFeed,
  CompletionEntry,
  FilterDef,
  Label,
  MemberProfile,
  Partner,
  Project,
  Section,
  Task,
} from "../api/types";
import type { SyncState } from "../dropbox/store";

/**
 * Keeps the app's in-memory AppData in step with Firestore.
 *
 * The rest of the app still works on one AppData object: edits clone it,
 * change it and hand the result to `save()`. Here that result is compared
 * with the last known state and only the changed documents -- and within
 * them only the changed fields -- are written, so two people editing
 * different tasks (or different fields of one task) don't overwrite each
 * other. Live listeners rebuild AppData whenever anything changes, locally
 * or from the other person, and pass it to `onChange`.
 *
 * Layout in Firestore:
 *   projects/{id}          members: [uid...] decides who sees the project
 *   sections/{id}, tasks/{id}   readable by the members of their project
 *   users/{uid}            profile; labels, filters, calendarFeeds and
 *                          completionMonths/{yyyy-MM} underneath are private
 *   userEmails/{email}     lets a project owner find someone to share with
 *
 * Each person's Inbox is the project "inbox_<uid>"; the app keeps calling it
 * "inbox". Completed tasks stay in the live data for a few days (for undo and
 * "done today"), then get `archived: true` and are only loaded on request, so
 * a long history doesn't cost reads on every launch. Calendar events are
 * re-fetched from their feeds on each device and never stored in Firestore.
 */

/** How long a completed task stays in the live data before it's archived. */
const ARCHIVE_AFTER_DAYS = 3;
const BATCH_LIMIT = 450;
const INBOX = "inbox";
/** Project fields changed only through the sharing functions, never by diffing. */
const PROJECT_MANAGED = new Set(["ownerId", "members", "memberProfiles"]);

export type Emit = (data: AppData) => void;

/** A sharing problem to show the user as-is. */
export class ShareError extends Error {}

// ---------- helpers ----------

function inboxId(uid: string): string {
  return `inbox_${uid}`;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => isEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)].filter((k) => ao[k] !== undefined || bo[k] !== undefined));
  for (const k of keys) if (!isEqual(ao[k], bo[k])) return false;
  return true;
}

function stripUndefined<T extends object>(o: T): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

function monthOf(at: string): string {
  return at.slice(0, 7);
}

function entryKey(e: CompletionEntry): string {
  return `${e.taskId}|${e.at}`;
}

// ---------- the sync session ----------

interface Op {
  kind: "set" | "update" | "delete";
  path: string[];
  data?: DocumentData;
}

export class FirestoreSync {
  private uid: string;
  private user: User;
  private emit: Emit;
  private unsubs: Unsubscribe[] = [];
  private projectUnsubs = new Map<string, Unsubscribe[]>();

  // Live state, keyed by Firestore document id.
  private profile: DocumentData | null = null;
  private projects = new Map<string, DocumentData>();
  private sectionsByProject = new Map<string, Map<string, DocumentData>>();
  private tasksByProject = new Map<string, Map<string, DocumentData>>();
  private archivedExtra = new Map<string, DocumentData>();
  /** Tasks someone shared with me on their own (not through a shared project). */
  private sharedTasks = new Map<string, DocumentData>();
  private labels = new Map<string, DocumentData>();
  private filters = new Map<string, DocumentData>();
  private feeds = new Map<string, DocumentData>();
  private months = new Map<string, CompletionEntry[]>();
  private events: CalendarEvent[];

  /** The AppData last handed to the app, which the next save is compared against. */
  private lastKnown: AppData | null = null;
  private initialWaiting = new Set<string>();
  private readyResolve!: (data: AppData) => void;
  private readyReject!: (err: unknown) => void;
  readonly ready: Promise<AppData>;
  private emitTimer: number | null = null;
  private archivedOnce = false;

  private pendingCommits = 0;
  private syncListeners = new Set<(s: SyncState) => void>();
  private syncState: SyncState = { status: "idle", pending: false };

  constructor(user: User, emit: Emit) {
    this.user = user;
    this.uid = user.uid;
    this.emit = emit;
    this.events = this.loadEvents();
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  // ---------- starting and stopping ----------

  async start(): Promise<void> {
    const db = firestore();
    await this.ensureProfile();

    // Until everything has loaded once, the app waits (one complete first
    // picture instead of a flicker). Listeners added later -- a project
    // shared with you, a new project -- just update the screen when ready.
    let loaded = false;
    const waitFor = (key: string) => {
      if (!loaded) this.initialWaiting.add(key);
    };
    const arrived = (key: string) => {
      if (!this.initialWaiting.delete(key)) return;
      if (this.initialWaiting.size === 0 && !loaded) {
        loaded = true;
        this.readyResolve(this.assemble());
      }
    };
    const failed = (key: string) => (err: unknown) => {
      console.error(`Firestore listener ${key} failed`, err);
      if (this.initialWaiting.has(key)) this.readyReject(err);
    };

    waitFor("profile");
    this.unsubs.push(
      onSnapshot(
        doc(db, "users", this.uid),
        (snap) => {
          this.profile = snap.data() ?? null;
          this.scheduleEmit();
          arrived("profile");
        },
        failed("profile")
      )
    );

    const personal: [string, Map<string, DocumentData>][] = [
      ["labels", this.labels],
      ["filters", this.filters],
      ["calendarFeeds", this.feeds],
    ];
    for (const [name, map] of personal) {
      waitFor(name);
      this.unsubs.push(
        onSnapshot(
          collection(db, "users", this.uid, name),
          (snap) => {
            for (const change of snap.docChanges()) {
              if (change.type === "removed") map.delete(change.doc.id);
              else map.set(change.doc.id, change.doc.data());
            }
            this.scheduleEmit();
            arrived(name);
          },
          failed(name)
        )
      );
    }

    waitFor("completionMonths");
    this.unsubs.push(
      onSnapshot(
        collection(db, "users", this.uid, "completionMonths"),
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type === "removed") this.months.delete(change.doc.id);
            else this.months.set(change.doc.id, (change.doc.data().entries as CompletionEntry[]) || []);
          }
          this.scheduleEmit();
          arrived("completionMonths");
        },
        failed("completionMonths")
      )
    );

    waitFor("shared");
    this.unsubs.push(
      onSnapshot(
        query(collection(db, "tasks"), where("sharedWith", "array-contains", this.uid)),
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type === "removed") this.sharedTasks.delete(change.doc.id);
            else this.sharedTasks.set(change.doc.id, change.doc.data());
          }
          this.scheduleEmit();
          arrived("shared");
        },
        failed("shared")
      )
    );

    waitFor("projects");
    this.unsubs.push(
      onSnapshot(
        query(collection(db, "projects"), where("members", "array-contains", this.uid)),
        (snap) => {
          for (const change of snap.docChanges()) {
            const id = change.doc.id;
            if (change.type === "removed") {
              this.projects.delete(id);
              this.stopProject(id);
            } else {
              this.projects.set(id, change.doc.data());
              if (!this.projectUnsubs.has(id)) this.watchProject(id, waitFor, arrived);
            }
          }
          this.scheduleEmit();
          arrived("projects");
        },
        failed("projects")
      )
    );

    this.ready.then(() => this.archiveOldCompleted()).catch(() => {});
  }

  private watchProject(id: string, waitFor: (k: string) => void, arrived: (k: string) => void) {
    const db = firestore();
    // Kept across retries, so what's on screen doesn't flicker away.
    const tasks = this.tasksByProject.get(id) ?? new Map<string, DocumentData>();
    const sections = this.sectionsByProject.get(id) ?? new Map<string, DocumentData>();
    this.tasksByProject.set(id, tasks);
    this.sectionsByProject.set(id, sections);
    const onError = (key: string) => (err: unknown) => {
      console.warn(`Stopped watching ${key}`, err);
      arrived(key);
      // A project just created here may not have reached the server yet, and
      // the rules refuse listening to its tasks until it has: retry shortly.
      // (If we were removed from a shared project, it's gone from
      // this.projects by then and nothing happens.)
      window.setTimeout(() => {
        if (this.projects.has(id) && this.projectUnsubs.get(id) === unsubs) {
          this.stopProjectListeners(id);
          this.watchProject(id, waitFor, arrived);
        }
      }, 3000);
    };
    const tKey = `tasks:${id}`;
    const sKey = `sections:${id}`;
    waitFor(tKey);
    waitFor(sKey);
    const unsubs: Unsubscribe[] = [];
    this.projectUnsubs.set(id, unsubs);
    unsubs.push(
      onSnapshot(
        query(collection(db, "tasks"), where("projectId", "==", id), where("archived", "==", false)),
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type === "removed") tasks.delete(change.doc.id);
            else tasks.set(change.doc.id, change.doc.data());
          }
          this.trackPending(snap.metadata.hasPendingWrites);
          this.scheduleEmit();
          arrived(tKey);
        },
        onError(tKey)
      ),
      onSnapshot(
        query(collection(db, "sections"), where("projectId", "==", id)),
        (snap) => {
          for (const change of snap.docChanges()) {
            if (change.type === "removed") sections.delete(change.doc.id);
            else sections.set(change.doc.id, change.doc.data());
          }
          this.scheduleEmit();
          arrived(sKey);
        },
        onError(sKey)
      )
    );
  }

  /** Stops a project's listeners but keeps the tasks already loaded (for a retry). */
  private stopProjectListeners(id: string) {
    this.projectUnsubs.get(id)?.forEach((u) => u());
    this.projectUnsubs.delete(id);
  }

  private stopProject(id: string) {
    this.projectUnsubs.get(id)?.forEach((u) => u());
    this.projectUnsubs.delete(id);
    this.tasksByProject.delete(id);
    this.sectionsByProject.delete(id);
  }

  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    for (const id of [...this.projectUnsubs.keys()]) this.stopProject(id);
    if (this.emitTimer) window.clearTimeout(this.emitTimer);
  }

  /** Profile, email lookup entry and Inbox for a first sign-in (or refreshes the profile). */
  private async ensureProfile() {
    const db = firestore();
    const email = (this.user.email || "").toLowerCase();
    const profile = {
      email,
      name: this.user.displayName || email.split("@")[0] || "Me",
      photo: this.user.photoURL || null,
    };
    // Writes are queued locally when offline, so this never blocks the app.
    void setDoc(doc(db, "users", this.uid), { ...profile, lastSeenAt: serverTimestamp() }, { merge: true });
    if (email) void setDoc(doc(db, "userEmails", email), { uid: this.uid, name: profile.name, photo: profile.photo });
    // Create the Inbox only if it's missing, so its settings aren't reset on every start.
    const inboxRef = doc(db, "projects", inboxId(this.uid));
    const existing = await getDoc(inboxRef).catch(() => null);
    if (existing && !existing.exists()) {
      void setDoc(inboxRef, {
        name: "Inbox",
        color: "grey",
        order: 0,
        isFavorite: false,
        isInboxProject: true,
        parentId: null,
        ownerId: this.uid,
        members: [this.uid],
      });
    }
  }

  // ---------- sharing ----------

  private myPartnerProfile(): Partner {
    return { uid: this.uid, ...this.myProfile() };
  }

  /** Sets the person that the "Shared" switch on tasks shares with. */
  async setPartner(email: string): Promise<Partner> {
    const key = email.trim().toLowerCase();
    const found = await getDoc(doc(firestore(), "userEmails", key));
    if (!found.exists()) {
      throw new ShareError(`No one has signed in to Opravilko as ${key} yet. Ask them to sign in once, then try again.`);
    }
    const { uid, name, photo } = found.data() as { uid: string; name: string; photo?: string | null };
    if (uid === this.uid) throw new ShareError("That's you.");
    const partner: Partner = { uid, name, email: key, photo: photo ?? null };
    await setDoc(doc(firestore(), "users", this.uid), { partner }, { merge: true });
    return partner;
  }

  /** Connects the person who shared something with you, in one click. */
  async setPartnerProfile(partner: Partner): Promise<void> {
    await setDoc(doc(firestore(), "users", this.uid), { partner }, { merge: true });
  }

  async clearPartner(): Promise<void> {
    await setDoc(doc(firestore(), "users", this.uid), { partner: deleteField() }, { merge: true });
  }

  private myProfile(): MemberProfile {
    const email = (this.user.email || "").toLowerCase();
    return { name: this.user.displayName || email.split("@")[0] || "Me", email, photo: this.user.photoURL || null };
  }

  /**
   * Adds someone to a project by their email. They need to have signed in to
   * Opravilko once, which is what registers the email.
   */
  async shareProject(appProjectId: string, email: string): Promise<MemberProfile> {
    const pid = this.toStoredProjectId(appProjectId)!;
    if (pid === inboxId(this.uid)) throw new Error("The Inbox can't be shared.");
    const db = firestore();
    const key = email.trim().toLowerCase();
    const found = await getDoc(doc(db, "userEmails", key));
    if (!found.exists()) {
      throw new ShareError(`No one has signed in to Opravilko as ${key} yet. Ask them to sign in once, then try again.`);
    }
    const { uid, name, photo } = found.data() as { uid: string; name: string; photo?: string | null };
    if (uid === this.uid) throw new ShareError("That's you.");
    const profile: MemberProfile = { name, email: key, photo: photo ?? null };
    await updateDoc(doc(db, "projects", pid), {
      members: arrayUnion(uid),
      [`memberProfiles.${uid}`]: profile,
      [`memberProfiles.${this.uid}`]: this.myProfile(),
    });
    return profile;
  }

  /** Owner removes someone from a project. */
  async unshareProject(appProjectId: string, uid: string): Promise<void> {
    const pid = this.toStoredProjectId(appProjectId)!;
    await updateDoc(doc(firestore(), "projects", pid), {
      members: arrayRemove(uid),
      [`memberProfiles.${uid}`]: deleteField(),
    });
  }

  /** A member (not the owner) leaves a shared project. */
  async leaveProject(appProjectId: string): Promise<void> {
    const pid = this.toStoredProjectId(appProjectId)!;
    await updateDoc(doc(firestore(), "projects", pid), { members: arrayRemove(this.uid) });
  }

  get userId(): string {
    return this.uid;
  }

  // ---------- Firestore -> AppData ----------

  private toAppProjectId(id: string | null | undefined): string | null {
    if (!id) return null;
    return id === inboxId(this.uid) ? INBOX : id;
  }

  private toStoredProjectId(id: string | null | undefined): string | null {
    if (!id) return null;
    return id === INBOX ? inboxId(this.uid) : id;
  }

  private scheduleEmit() {
    if (this.initialWaiting.size > 0 || this.emitTimer) return;
    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = null;
      this.emit(this.assemble());
    }, 0);
  }

  private assemble(): AppData {
    const projects: Project[] = [];
    for (const [id, p] of this.projects) {
      // Someone else's Inbox never shows up, even if it were shared by mistake.
      if (p.isInboxProject && id !== inboxId(this.uid)) continue;
      projects.push({ ...(p as Project), id: this.toAppProjectId(id)!, parentId: this.toAppProjectId(p.parentId) });
    }
    const sections: Section[] = [];
    for (const map of this.sectionsByProject.values())
      for (const [id, s] of map) sections.push({ ...(s as Section), id, projectId: this.toAppProjectId(s.projectId)! });
    const tasks: Task[] = [];
    const seen = new Set<string>();
    const pushTask = (id: string, t: DocumentData) => {
      if (seen.has(id)) return;
      seen.add(id);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { archived: _archived, ...rest } = t;
      tasks.push({ ...(rest as Task), id, projectId: this.toAppProjectId(t.projectId)! });
    };
    for (const map of this.tasksByProject.values()) for (const [id, t] of map) pushTask(id, t);
    // Shared with me on their own: they keep their creator's project id, which
    // isn't one of mine -- the app shows them in Midva and the date views.
    // (No "archived" filter on that query, so old finished ones are skipped here.)
    for (const [id, t] of this.sharedTasks) if (!t.archived) pushTask(id, t);
    for (const [id, t] of this.archivedExtra) if (this.tasksByProject.has(t.projectId)) pushTask(id, t);

    const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
    const completionLog = [...this.months.keys()]
      .sort()
      .flatMap((m) => this.months.get(m) || [])
      .sort((a, b) => a.at.localeCompare(b.at));

    const data: AppData = {
      version: 1,
      projects: projects.sort(byOrder),
      sections: sections.sort(byOrder),
      labels: [...this.labels].map(([id, l]) => ({ ...(l as Label), id })).sort(byOrder),
      filters: [...this.filters].map(([id, f]) => ({ ...(f as FilterDef), id })).sort(byOrder),
      tasks,
      calendarFeeds: [...this.feeds].map(([id, f]) => ({ ...(f as CalendarFeed), id })),
      calendarEvents: this.events,
      completionLog,
      me: this.uid,
      partner: (this.profile?.partner as Partner | undefined) ?? null,
    };
    this.lastKnown = data;
    return data;
  }

  /** Whether this person finished first-run setup (import or start fresh). */
  get setupDone(): boolean {
    return Boolean(this.profile?.setupDone);
  }

  // ---------- AppData -> Firestore ----------

  /**
   * Writes whatever differs between `base` -- the data the edit started from
   * -- and `next`. Comparing against the edit's own starting point (not
   * whatever arrived since) means only what the edit itself changed is
   * written: a task that showed up meanwhile is never mistaken for deleted.
   */
  save(next: AppData, base?: AppData) {
    const prev = base ?? this.lastKnown;
    this.lastKnown = next;
    if (!prev) return;
    if (!isEqual(prev.calendarEvents || [], next.calendarEvents || [])) {
      this.events = next.calendarEvents || [];
      this.storeEvents();
    }
    const ops = this.diff(prev, next);
    if (ops.length) this.commit(ops);
  }

  private diff(prev: AppData, next: AppData): Op[] {
    const ops: Op[] = [];
    const uid = this.uid;

    // Projects: ownership and members are set here only when creating.
    this.diffList(prev.projects, next.projects, ops, {
      path: (id) => ["projects", this.toStoredProjectId(id)!],
      toDoc: (p) => ({ ...stripUndefined(p), parentId: this.toStoredProjectId(p.parentId) }),
      onCreate: (d) => ({ ...d, ownerId: uid, members: [uid] }),
      skip: PROJECT_MANAGED,
    });
    this.diffList(prev.sections, next.sections, ops, {
      path: (id) => ["sections", id],
      toDoc: (s) => ({ ...stripUndefined(s), projectId: this.toStoredProjectId(s.projectId) }),
    });
    this.diffList(prev.tasks, next.tasks, ops, {
      path: (id) => ["tasks", id],
      toDoc: (t) => ({ ...stripUndefined(t), projectId: this.toStoredProjectId(t.projectId) }),
      onCreate: (d) => ({
        ...d,
        archived: false,
        createdBy: d.createdBy ?? uid,
        ...(d.sharedWith?.length ? { sharedBy: this.myPartnerProfile() } : {}),
      }),
      onUpdate: (fields, t) => {
        // Sharing it (or unsharing): record who it's from.
        if ("sharedWith" in fields) fields.sharedBy = t.sharedWith?.length ? this.myPartnerProfile() : deleteField();
        if ("completed" in fields) {
          // Un-completing brings an archived task back into the live data.
          if (!t.completed) fields.archived = false;
          fields.completedBy = t.completed ? uid : deleteField();
        }
        return fields;
      },
    });
    this.diffList(prev.labels, next.labels, ops, { path: (id) => ["users", uid, "labels", id], toDoc: stripUndefined });
    this.diffList(prev.filters, next.filters, ops, { path: (id) => ["users", uid, "filters", id], toDoc: stripUndefined });
    this.diffList(prev.calendarFeeds || [], next.calendarFeeds || [], ops, {
      path: (id) => ["users", uid, "calendarFeeds", id],
      toDoc: stripUndefined,
    });

    // Completion log: grouped into one document per month.
    const before = new Map((prev.completionLog || []).map((e) => [entryKey(e), e]));
    const after = new Map((next.completionLog || []).map((e) => [entryKey(e), e]));
    const added = new Map<string, CompletionEntry[]>();
    const removed = new Map<string, CompletionEntry[]>();
    for (const [k, e] of after) if (!before.has(k)) added.set(monthOf(e.at), [...(added.get(monthOf(e.at)) || []), e]);
    for (const [k, e] of before) if (!after.has(k)) removed.set(monthOf(e.at), [...(removed.get(monthOf(e.at)) || []), e]);
    for (const [m, es] of added)
      ops.push({ kind: "set", path: ["users", uid, "completionMonths", m], data: { entries: arrayUnion(...es.map(stripUndefined)) } });
    for (const [m, es] of removed)
      ops.push({ kind: "update", path: ["users", uid, "completionMonths", m], data: { entries: arrayRemove(...es.map(stripUndefined)) } });
    return ops;
  }

  private diffList<T extends { id: string }>(
    prev: T[],
    next: T[],
    ops: Op[],
    o: {
      path: (id: string) => string[];
      toDoc: (item: T) => DocumentData;
      onCreate?: (d: DocumentData) => DocumentData;
      onUpdate?: (fields: DocumentData, item: T) => DocumentData;
      skip?: Set<string>;
    }
  ) {
    const before = new Map(prev.map((i) => [i.id, i]));
    const after = new Map(next.map((i) => [i.id, i]));
    for (const [id, item] of after) {
      const old = before.get(id);
      const d = o.toDoc(item);
      delete d.id;
      if (!old) {
        ops.push({ kind: "set", path: o.path(id), data: o.onCreate ? o.onCreate(d) : d });
        continue;
      }
      const od = o.toDoc(old);
      delete od.id;
      let fields: DocumentData = {};
      for (const k of new Set([...Object.keys(d), ...Object.keys(od)])) {
        if (o.skip?.has(k)) continue;
        if (!(k in d)) fields[k] = deleteField();
        else if (!isEqual(d[k], od[k])) fields[k] = d[k];
      }
      if (Object.keys(fields).length === 0) continue;
      if (o.onUpdate) fields = o.onUpdate(fields, item);
      ops.push({ kind: "update", path: o.path(id), data: fields });
    }
    for (const id of before.keys()) if (!after.has(id)) ops.push({ kind: "delete", path: o.path(id) });
  }

  private commit(ops: Op[]) {
    const db = firestore();
    // Deletes of a project's tasks must not run after the project itself is
    // gone (the rules look the project up), so projects are deleted last.
    const order = (op: Op) => (op.kind === "delete" && op.path[0] === "projects" ? 1 : 0);
    const sorted = [...ops].sort((a, b) => order(a) - order(b));
    for (let i = 0; i < sorted.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const op of sorted.slice(i, i + BATCH_LIMIT)) {
        const ref = doc(db, op.path[0], ...op.path.slice(1));
        if (op.kind === "delete") batch.delete(ref);
        // "update" as a merge-set, so a document removed meanwhile is simply recreated.
        else if (op.kind === "update") batch.set(ref, op.data!, { merge: true });
        else batch.set(ref, op.data!, { merge: op.path[0] === "users" });
      }
      this.pendingCommits++;
      this.updateSync();
      batch
        .commit()
        .then(() => {
          this.pendingCommits--;
          this.updateSync();
        })
        .catch((err) => {
          this.pendingCommits--;
          console.error("Firestore write failed", err);
          this.setSync({
            status: "error",
            pending: false,
            message:
              err?.code === "permission-denied"
                ? "That change isn't allowed (for example, only a project's owner can delete it)."
                : err?.message || "Couldn't save",
          });
        });
    }
  }

  // ---------- completed-task archive ----------

  /** Archives tasks completed more than a few days ago, so they stop costing reads. */
  archiveOldCompleted() {
    if (this.archivedOnce || !this.lastKnown) return;
    this.archivedOnce = true;
    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86_400_000).toISOString();
    const tasks = this.lastKnown.tasks;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const ops: Op[] = tasks
      .filter((t) => t.completed && t.completedAt && t.completedAt < cutoff)
      // Keep finished sub-tasks of open tasks, so "2/3 done" stays right.
      .filter((t) => !t.parentId || !byId.get(t.parentId) || byId.get(t.parentId)!.completed)
      .map((t) => ({ kind: "update" as const, path: ["tasks", t.id], data: { archived: true } }));
    if (ops.length) this.commit(ops);
  }

  /** Loads archived (older completed) tasks on request, e.g. for the Completed view. */
  async loadArchived(): Promise<void> {
    const db = firestore();
    for (const pid of this.projects.keys()) {
      const snap = await getDocs(query(collection(db, "tasks"), where("projectId", "==", pid), where("archived", "==", true)));
      snap.forEach((d) => this.archivedExtra.set(d.id, d.data()));
    }
    this.emit(this.assemble());
  }

  // ---------- sync status ----------

  private trackPending(hasPendingWrites: boolean) {
    if (!hasPendingWrites && this.pendingCommits === 0) this.updateSync();
  }

  private updateSync() {
    if (this.syncState.status === "error" && this.pendingCommits > 0) return;
    const pending = this.pendingCommits > 0;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    this.setSync({
      status: pending ? (offline ? "offline" : "saving") : offline ? "offline" : "saved",
      pending,
      message: undefined,
    });
  }

  private setSync(next: SyncState) {
    this.syncState = next;
    this.syncListeners.forEach((l) => l(next));
  }

  subscribeSync(listener: (s: SyncState) => void): () => void {
    this.syncListeners.add(listener);
    listener(this.syncState);
    return () => this.syncListeners.delete(listener);
  }

  onNetworkChange() {
    this.updateSync();
  }

  hasPendingWrite(): boolean {
    return this.pendingCommits > 0;
  }

  // ---------- calendar events (this device only) ----------

  private eventsKey() {
    return `opravilko.events.${this.uid}`;
  }

  private loadEvents(): CalendarEvent[] {
    try {
      return JSON.parse(localStorage.getItem(this.eventsKey()) || "[]");
    } catch {
      return [];
    }
  }

  private storeEvents() {
    try {
      localStorage.setItem(this.eventsKey(), JSON.stringify(this.events));
    } catch {
      /* storage full: events are re-fetched from the feeds anyway */
    }
  }

  // ---------- first-run setup ----------

  async markSetupDone() {
    await setDoc(doc(firestore(), "users", this.uid), { setupDone: true }, { merge: true });
  }

  /**
   * Copies a whole AppData (e.g. the old Dropbox file) into Firestore as this
   * person's data, then marks setup done.
   */
  async importAll(data: AppData) {
    const base = this.lastKnown ?? this.assemble();
    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86_400_000).toISOString();
    // Projects, sections and tasks live in shared collections, so imported
    // ids get fresh ones: the same file imported twice (or by two people)
    // must never land on someone else's documents.
    const ids = new Map<string, string>([[INBOX, INBOX]]);
    const fresh = (old: string | null | undefined) => {
      if (!old) return null;
      if (!ids.has(old)) ids.set(old, newId());
      return ids.get(old)!;
    };
    const inboxOld = new Set(data.projects.filter((p) => p.isInboxProject).map((p) => p.id));
    inboxOld.forEach((id) => ids.set(id, INBOX));
    const next: AppData = {
      ...base,
      projects: [
        ...base.projects.filter((p) => p.id === INBOX),
        ...data.projects
          .filter((p) => !inboxOld.has(p.id))
          .map((p) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { ownerId: _o, members: _m, memberProfiles: _p, ...rest } = p;
            return { ...rest, id: fresh(p.id)!, parentId: fresh(p.parentId) };
          }),
      ],
      sections: data.sections.map((s) => ({ ...s, id: fresh(s.id)!, projectId: fresh(s.projectId)! })),
      labels: data.labels,
      filters: data.filters,
      tasks: data.tasks.map((t) => ({
        ...t,
        id: fresh(t.id)!,
        projectId: fresh(t.projectId)!,
        sectionId: fresh(t.sectionId),
        parentId: fresh(t.parentId),
      })),
      calendarFeeds: data.calendarFeeds || [],
      completionLog: (data.completionLog || []).map((e) => ({
        ...e,
        taskId: ids.get(e.taskId) ?? e.taskId,
        projectId: ids.get(e.projectId) ?? e.projectId,
      })),
      calendarEvents: base.calendarEvents,
    };
    // A plain diff from the (empty) current state writes everything.
    const ops = this.diff(base, next);
    // Old completed tasks go straight into the archive.
    for (const op of ops) {
      if (op.path[0] === "tasks" && op.kind === "set" && op.data?.completed && op.data.completedAt < cutoff) {
        op.data.archived = true;
      }
    }
    this.lastKnown = next;
    // Show it right away; the listeners take over once the server has it.
    this.emit(next);
    this.commit(ops);
    await this.markSetupDone();
  }
}
