import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import sessionRouter, { requireAuth } from "./routes/session.js";
import dropboxAuthRouter from "./routes/dropboxAuth.js";
import dataRouter from "./routes/data.js";
import { flush } from "./store.js";
import { isDropboxConfigured } from "./dropboxClient.js";

const app = express();
const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dropboxConfigured: isDropboxConfigured() });
});

app.use("/api/auth/dropbox", dropboxAuthRouter);
app.use("/api/auth", sessionRouter);
app.use("/api", requireAuth, dataRouter);

app.listen(PORT, () => {
  console.log(`Opravilko backend listening on :${PORT}`);
  if (!isDropboxConfigured()) {
    console.log(
      `Dropbox is not fully configured yet. Visit http://localhost:${PORT}/api/auth/dropbox/connect once DROPBOX_APP_KEY/SECRET are set.`
    );
  }
});

async function shutdown() {
  await flush();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
