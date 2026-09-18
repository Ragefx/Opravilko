import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const router = Router();

const APP_PASSWORD = process.env.APP_PASSWORD || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "opravilko_session";
const isProd = process.env.NODE_ENV === "production";

router.post("/login", (req: Request, res: Response) => {
  const { password } = req.body || {};
  if (!APP_PASSWORD) {
    res.status(500).json({ error: "Server has no APP_PASSWORD configured." });
    return;
  }
  if (password !== APP_PASSWORD) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }
  const token = jwt.sign({ ok: true }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get("/me", (req: Request, res: Response) => {
  if (!APP_PASSWORD) {
    res.json({ authenticated: true });
    return;
  }
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.json({ authenticated: false });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true });
  } catch {
    res.json({ authenticated: false });
  }
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!APP_PASSWORD) {
    // No password configured (e.g. local dev) -- allow through.
    next();
    return;
  }
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired." });
  }
}

export default router;
