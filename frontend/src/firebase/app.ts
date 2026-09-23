import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { firebaseConfig, useEmulator } from "./config";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

function init() {
  if (app || !firebaseConfig) return;
  app = initializeApp(firebaseConfig);
  // The local cache (IndexedDB) keeps everything readable and editable
  // offline; edits made meanwhile are sent when the connection returns.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  auth = getAuth(app);
  if (useEmulator) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
}

export function firestore(): Firestore {
  init();
  if (!db) throw new Error("Firebase is not configured");
  return db;
}

export function firebaseAuth(): Auth {
  init();
  if (!auth) throw new Error("Firebase is not configured");
  return auth;
}
