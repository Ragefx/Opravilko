# Opravilko

A personal task manager modeled on Todoist's look and workflow — projects, sections,
labels, priorities, due dates, filters, Today/Upcoming views — with your data stored
in your own Dropbox account instead of a third-party server.

## How it's built

- **`frontend/`** — React + TypeScript + Vite. Todoist-style sidebar, quick-add,
  task list, and a task detail panel. Talks to the backend over a small REST API.
- **`backend/`** — Express + TypeScript. Holds your Dropbox OAuth token, exposes a
  REST API for projects/sections/tasks/labels/filters, and persists everything as a
  single JSON file (`opravilko-data.json`) in your Dropbox account.
- **Single user, single JSON file.** There's no database — the backend keeps an
  in-memory copy of your data and writes it back to Dropbox a couple seconds after
  each change (debounced). This is intentionally simple since it's built for one
  person's use.

## One-time setup

### 1. Create a Dropbox app

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps) and
   click **Create app**.
2. Choose **Scoped access**, then **App folder** access (Opravilko only touches its
   own folder — simplest and safest).
3. Name it anything (e.g. "Opravilko").
4. Under **Permissions**, enable `files.content.write` and `files.content.read`,
   then save.
5. Under **Settings**, add a redirect URI:
   `http://localhost:4000/api/auth/dropbox/callback` for local dev, and your
   deployed backend URL + `/api/auth/dropbox/callback` once it's hosted.
6. Copy the **App key** and **App secret** — you'll need them below.

### 2. Configure the backend

```
cd backend
cp .env.example .env
```

Fill in `.env`:

```
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
APP_PASSWORD=pick-something-only-you-know   # protects the app once it's public
JWT_SECRET=any-long-random-string
```

Install and start it:

```
npm install
npm run dev
```

### 3. Connect your Dropbox account (one time)

With the backend running, visit:

```
http://localhost:4000/api/auth/dropbox/connect
```

Approve access in Dropbox. The callback page shows a **refresh token** — copy it
into `DROPBOX_REFRESH_TOKEN` in `backend/.env`, then restart the backend. From then
on the server can read/write your data without asking again.

### 4. Run the frontend

```
cd frontend
cp .env.example .env   # VITE_API_URL should point at your backend
npm install
npm run dev
```

Open the printed local URL, log in with the `APP_PASSWORD` you set, and start
adding tasks.

## Data model

Everything lives in one JSON document (`DROPBOX_DATA_PATH`, default
`/opravilko-data.json` inside your Dropbox app folder):

- **projects** — name, color, favorite flag; the seeded `Inbox` project can't be
  deleted.
- **sections** — group tasks within a project.
- **tasks** — content, description, project/section/parent, priority (1–4), due
  date, labels, completion state.
- **labels** — reusable tags, referenced by name on tasks.
- **filters** — saved searches using a small query language: space-separated
  tokens like `today`, `overdue`, `upcoming`, `p1`–`p4`, `@label`, `#Project`.

Because it's a single JSON file, you can also open it directly from the Dropbox app
on your phone or in Dropbox Paper-adjacent tools if you ever want to eyeball or
back up the raw data — same idea as how you already keep Basecamp/paper-planning
files there.

## Deploying

- **Backend**: any Node host that lets you set environment variables and keeps the
  process warm (Render, Fly.io, Railway all work well). Set the same variables as
  `.env`, plus `CORS_ORIGIN` pointing at your deployed frontend URL and
  `NODE_ENV=production`.
- **Frontend**: any static host (Vercel, Netlify, Cloudflare Pages). Set
  `VITE_API_URL` to your deployed backend's URL at build time.
- Don't forget to add the deployed backend's callback URL
  (`https://your-backend/api/auth/dropbox/callback`) to the Dropbox app's redirect
  URIs, and re-run the one-time connect step once against production to get a
  refresh token for that environment.

## Roadmap ideas (not built yet)

- Recurring due dates (`rrule` field already exists on `Due`, just unused by the UI)
- Comments per task
- Drag-and-drop reordering
- Board view for projects
- Keyboard shortcuts (Todoist-style `q` for quick add, `x` complete, etc.)
