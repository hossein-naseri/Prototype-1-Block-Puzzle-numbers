# Operator Blocks

A prototype puzzle game for testing five rule variants on one shared core
mechanic. Plain HTML/JS, no framework, no build step. See `DESIGN.md` for
the rules and config values.

## Running it locally

Any static file server works, since it's ES modules over `<script
type="module">` (this won't load correctly from a bare `file://` URL —
browsers block module imports there). From the repo root:

```
python3 -m http.server 8000
# or: npx http-server -p 8000
```

Then open `http://localhost:8000/`. Pass the variant and seed in the URL,
e.g. `http://localhost:8000/?variant=bloom&seed=4471`, or use the in-page
variant selector / seed field.

`npm test` runs the sanity checks (`test/sanity.js`) — number rules,
legality, line matching, quotas, and the Fight Mode conversion rules. No
browser needed.

## Checking which build you're actually running

The footer shows a build number (`APP_VERSION` in `config/config.js`),
bumped on every push. If it doesn't match the newest one, you're on a stale
copy — see the deploy checklist below.

This matters because the app is ~14 separate ES modules with no build step
and no cache busting. GitHub Pages serves everything with a 10-minute
`max-age`, so a browser can end up mixing modules from two different
versions, which produces incoherent behaviour rather than an obvious error.

## Deploying to GitHub Pages

This repo needs **no build step** — Pages can serve the working tree
directly. One-time setup (needs your GitHub account — I can't flip repo
settings myself):

1. Push this branch's work to `main` (either merge the PR, or push directly
   if you'd rather skip a PR):
   ```
   git checkout main
   git merge claude/operator-blocks-prototype-570qr1
   git push origin main
   ```
2. In the GitHub repo: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a
   branch**.
4. Under **Branch**, choose `main` and folder `/ (root)`, then **Save**.
5. GitHub shows the live URL at the top of that same Pages settings page
   once the first deployment finishes (usually under a minute) — something
   like `https://<your-username>.github.io/<repo-name>/`.

That's it — no Actions workflow needed for a static site this size. `git
push origin main` after that is all it takes to update the live version;
GitHub Pages redeploys automatically on every push to the configured
branch.

### Checklist for testing a new version

Merging does **not** publish instantly — Pages runs a build first. Loading
too early serves the old version and then caches it for 10 minutes, which
is the most common cause of "my change isn't there".

1. Merge to `main`.
2. **Wait for the deploy.** Repo → **Actions** → the newest
   *pages build and deployment* run → wait for the green check (~30–60s).
3. Open the Pages URL.
4. **Check the build number in the footer.** If it's not the newest, force a
   clean fetch: open DevTools (F12), then right-click Chrome's reload button
   → **Empty Cache and Hard Reload**. (That menu item only appears while
   DevTools is open.)

Notes:

- `Ctrl/Cmd+Shift+R` is usually enough, but *Empty Cache and Hard Reload* is
  the one that never leaves a stale module behind.
- **Incognito is not a fresh cache.** All incognito tabs and windows share
  one cache while any of them is open. To reset it you must close **every**
  incognito window, then open a new one.
- Adding `?v=123` to the URL does **not** help: it busts `index.html` only.
  The JS modules are fetched from their own unchanged paths, so they stay
  cached.
- Settings persist in `localStorage` across deploys by design. After a
  change to default tuning values, hit **Reset to defaults** in the Settings
  panel to pick the new ones up.

If you'd rather not touch `main` yet and just want to preview this branch
first: Pages' branch dropdown (step 4) can point at
`claude/operator-blocks-prototype-570qr1` directly instead of `main` — same
steps, just pick this branch. Switch it to `main` later once you're happy
with what's here.
