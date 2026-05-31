# Erdős Problem Tracker

A frontend dashboard for tracking the status of problems from the Erdős problem dataset.

This repository provides a React + Vite application that:

- loads the public `teorth/erdosproblems` YAML dataset from GitHub
- parses and displays problem metadata in a searchable, sortable table
- tracks problem counts for solved, open, and AI-assisted status
- supports filtering by problem number, status, last updated date, and tags
- includes a burn-up/burn-down chart for progress visualization

## What it does

The app fetches raw YAML data from the Erdős problems repository and converts it into an interactive dashboard.

Main features:

- `StatCard` panels that show total problems, solved/resolved problems, open problems, and Lean-assisted problems
- drill-down views for each category using the table view buttons
- table sorting by `Number`, `Status`, and `Last Updated`
- per-column filtering with dialog controls and spreadsheet-style expressions
- `Number`, `Status`, `Last Updated`, and `Tags` columns reordered to a consistent layout
- chart visualization for cumulative solved problems and remaining open problems

## How it works

The main application component in `src/App.jsx`:

- dynamically loads `js-yaml` to parse the GitHub YAML dataset
- processes the dataset to compute statistics and chart history
- maintains interactive state for view selection, sorting, and filters
- renders a table and filter dialogs using Tailwind-style CSS classes

The `ProblemTable` component handles:

- filtering problems by current view (`total`, `solved`, `open`, `aiAssisted`)
- sorting problems by selected column and direction
- populating filter option lists from live problem data
- applying text expression overrides for date and number filters

## Getting started

Install dependencies and run the app locally:

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal to view the dashboard.

## Build

Create a production build with:

```bash
npm run build
```

## Notes

- The data source is loaded from the GitHub raw URL at runtime.
- The application is intentionally kept as a single-page React app.
- The current implementation uses dynamic YAML parsing via `js-yaml`.

## Project structure

- `src/App.jsx` — main dashboard logic and problem table UI
- `src/main.jsx` — React entry point
- `src/index.css` / `src/App.css` — app styles
- `public/` — static assets

## License

This repository is provided as-is for tracking Erdős problem status.
