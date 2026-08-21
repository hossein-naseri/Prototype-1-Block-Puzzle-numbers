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

`npm test` runs the sanity checks (`test/sanity.js`) — legality, collapse,
and Blueprint-solver checks, no browser needed.

`node scripts/solve-levels.mjs` brute-forces all 8 Blueprint levels and
confirms each is solvable at its authored par.

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

If you'd rather not touch `main` yet and just want to preview this branch
first: Pages' branch dropdown (step 4) can point at
`claude/operator-blocks-prototype-570qr1` directly instead of `main` — same
steps, just pick this branch. Switch it to `main` later once you're happy
with what's here.
