# TI 2026 Players Trainer

Static training site for memorizing Dota 2 players and coaches qualified for The International 2026.

## Update data

```powershell
python scripts/fetch_liquipedia.py
```

The generator uses the Liquipedia MediaWiki API with a custom user agent, gzip, request reuse, and conservative request spacing. It writes the snapshot to `public/data/players.json`.

## Run locally

```powershell
python -m http.server 4173 -d public
```

Then open `http://localhost:4173`.

## Render

Use Render Static Site:

- Build command: `python -c "print('Using committed static snapshot')"`
- Publish directory: `public`

The committed `public/data/players.json` and local image assets are the published snapshot. Run the generator manually when you want to refresh Liquipedia data.

## Attribution

Data is sourced from Liquipedia Dota 2 Wiki. Liquipedia text/code is available under CC-BY-SA. Licenses for media vary.
