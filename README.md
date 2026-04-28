# Differential Dialogue: House M.D. Character Intelligence Console

This is the static D3/JavaScript frontend for Project 3.

It expects your cleaned Project 3 data files in `/data`.

## Required data files

Copy these from your local `data/` folder into this project’s `data/` folder:

```text
major_characters.csv
character_summary.csv
character_season_summary.csv
character_episode_summary.csv
episode_summary.csv
speaker_edges_major.csv
character_words_top50_by_season.csv
dialogue_lines.csv
episode_parse_report.csv
```

`dialogue_lines.csv` is needed for the Phrase Tracker. The rest powers the dashboard summaries, heatmap, network, matrix, and lexical fingerprint.

## Local test

From the project folder:

```powershell
python -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

Do not open `index.html` directly by double-clicking. Browser security can block CSV loading from `file://`.

## Suggested folder structure

```text
DataViz_P3_Frontend/
  index.html
  style.css
  js/
    main.js
  data/
    major_characters.csv
    character_summary.csv
    character_season_summary.csv
    character_episode_summary.csv
    episode_summary.csv
    speaker_edges_major.csv
    character_words_top50_by_season.csv
    dialogue_lines.csv
    episode_parse_report.csv
```

## Push to a brand-new GitHub repo

From inside the frontend folder:

```powershell
git init
git add .
git commit -m "Initial House MD dialogue intelligence dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_NEW_REPO_NAME.git
git push -u origin main
```

If Git asks who you are:

```powershell
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

## Deploy on Vercel

1. Go to Vercel.
2. Add New Project.
3. Import the GitHub repo.
4. Framework Preset: **Other**.
5. Build Command: leave empty.
6. Output Directory: leave empty or set to `.`.
7. Deploy.

Because this is a static frontend, Vercel only needs to serve the files.

## Notes

- The dashboard is intentionally built with vanilla JS + D3 v7.
- No React, no Svelte, no TypeScript, no charting library.
- The UI is designed as a liquid-glass diagnostic console inspired by your Project 2 visual language.
- The main cast is fixed to 14 recurring characters through the preprocessing pipeline.
