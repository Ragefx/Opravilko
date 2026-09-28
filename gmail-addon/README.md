# Opravilko for Gmail

A Gmail side panel (like Todoist's): open an email and it suggests a task,
with the subject as its name and a date and time found in the email
("Nedelja, 11.10.2026 … Čas 16:00" becomes Sun 11 Oct, 16:00). Pick the list,
share it with your partner if you like, and press **Add task**. The task
lands in Opravilko straight away, and your phones get a nudge.

It works through Opravilko's helper on Cloudflare (`worker/`), so that has to
be deployed first, and `HELPER_URL` at the top of `Code.gs` set to its address.

## Installing (each of you, once)

1. Opravilko → Settings → **Import, backup & Gmail** → scroll to **Gmail** → **Make a key**, then Copy.
2. Go to <https://script.google.com> → **New project**, and name it "Opravilko".
3. Project settings (⚙) → tick **Show "appsscript.json" manifest file in editor**.
4. Back in the editor, replace the contents of:
   - `appsscript.json` with this folder's `appsscript.json`
   - `Code.gs` with this folder's `Code.gs` (everything is in this one file)
5. Save, then **Deploy → Test deployments → Application: Gmail → Install**.
6. Open Gmail (a reload may be needed). The Opravilko icon is in the right-hand
   bar. Open it, allow access, and paste the key.

The add-on runs only in your own Gmail and only reads the email you have open.
A new key (Make a new key) stops the old one working.
