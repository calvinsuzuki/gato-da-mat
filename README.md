# Math Cat Memorial

Static memorial site for the cat that lived at USP. Hosted on GitHub Pages.

## Setup

1. Replace `YOUR_EMAIL_HERE@example.com` in `index.html`.
2. Push to a GitHub repo.
3. Repo → Settings → Pages → Source: `Deploy from a branch` → `main` / `(root)` → Save.
4. Site lives at `https://<user>.github.io/<repo>/`.

## Adding photos (the easy way)

1. Drop image files into `images/` and push to `main`.
2. The GitHub Action (`.github/workflows/manifest.yml`) regenerates `images.json` automatically and commits it back. Pages redeploys. Done.

**Tip — control order:** files are sorted reverse-alphabetical, so prefix with a date for newest-first ordering:

```
images/2026-04-25-courtyard.jpg
images/2026-04-20-bench.jpg
images/2026-03-10-snoozing.png
```

**Supported formats:** jpg, jpeg, png, webp, gif, avif.

**Tip — file size:** resize to ~1600px wide before committing. Keeps the repo small and the page fast.

## Captions (optional)

Edit `captions.json` to add a caption to a specific file:

```json
{
  "2026-04-25-courtyard.jpg": "Sleeping in the sun by Block A.",
  "2026-04-20-bench.jpg": "Their favorite bench."
}
```

Files without an entry render with no caption. Safe to leave the file as `{}`.

## Adding photos manually (no Action)

If you don't want to rely on the GitHub Action, run the script locally before pushing:

```bash
bash scripts/generate-manifest.sh
git add images images.json
git commit -m "Add new photos"
git push
```

## Run locally

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. Note: `fetch` of local JSON files needs an HTTP server — opening `index.html` directly via `file://` will not load the feed.
