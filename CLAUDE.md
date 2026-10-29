# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Casa Nostra is a static PWA (Italian UI, Italian code identifiers) published as-is on GitHub Pages at `https://pk8646.github.io/home-sweet-home/`. No build, no framework, no Node in the repo: plain HTML/CSS/vanilla JS for Chromium ≥ 80. The spec is GitHub issue #1; `README.md` is the user-facing guide.

## Development and tests

The test suite lives in `test/` at the repo root (ADR-0003). It has its own `package.json` with one dependency, `playwright-core` (it drives the installed Chrome, no browser download): run `npm install` inside `test/` once per clone or worktree. The published site stays free of Node and build: `_config.yml` excludes `test/` from Jekyll on Pages. Commands run from the repo root; the site root defaults to the repo containing `test/`.

```
node test/server.js [root] [port]                  # serve the site under /home-sweet-home/ like Pages; prints the URL
node test/run.js                                   # whole suite (default viewport tabletOrizzontale 1024×600)
node test/run.js --viewport tabletVerticale        # also: smartphone, desktop
node test/run.js agenda                            # one file: test/tests/agenda.test.js
node test/run.js agenda --grep "ora legale"        # one test, by substring of its name
```

Options: `--root <dir>` tests another site root (e.g. another worktree), `--paralleli N` (default 4), `--headed`. `CASA_NOSTRA_ROOT` replaces `--root`; `CASA_NOSTRA_CHROME` overrides the Chrome path (default `C:\Program Files\Google\Chrome\Application\chrome.exe`). Each run picks a free port, so several runners can run at once, but running all four viewports concurrently on this PC causes spurious `page.goto` timeouts: run them one after another to confirm a failure.

Release check: the whole suite green on all four viewports (`tabletOrizzontale`, `tabletVerticale`, `smartphone`, `desktop`).

### How the suite works

- One seam: the real app in Chrome via `playwright-core`, acting only as a user and asserting on what is on screen. External boundaries are simulated: Open-Meteo network, chosen files, downloads, clock (`Europe/Rome`). Internal functions are not unit-tested.
- Layout under `test/`: `run.js` (runner), `server.js` (static server), `lib/` (`test.js` API, `app.js` with `apri()`, `statico.js` syntax/resource checks, helpers `benvenuto.js`, `meteo-finto.js`, `immagini.js`), `tests/<area>.test.js`. `tests/collaudo.test.js` holds the cross-cutting release checks. `NOTE-architettura.md` there documents the `apri()` options and helpers.
- A test fails on any `console.error` or `pageerror`. Handled errors must go through `CasaNostra.errori` (which uses `console.warn`).
- Service Worker is blocked by default in tests; `apri({ serviceWorker: 'allow' })` exercises it.
- `statico.js` skips `test/` (and hidden folders, `node_modules`) when checking the site's own files.

## Architecture

Single page, hash router (`#/`, `#/spesa`, `#/agenda`, `#/attivita`, `#/casa`, `#/foto`, `#/impostazioni`). All resource paths are relative so the app works under any sub-path.

Classic scripts, loaded in order by `index.html`; each adds exactly one property to `window.CasaNostra`:

| Layer | Files | Role |
|---|---|---|
| Core | `js/casanostra.js`, `date.js`, `db.js`, `errori.js`, `ui.js`, `dialoghi.js`, `impostazioni.js` | namespace, ids and the `PREFISSO_LOCALSTORAGE`; local-date arithmetic on `AAAA-MM-GG` strings (never UTC `Date`); IndexedDB collections (`RACCOLTE`, `STRUTTURATE`) with atomic `replaceAll` and the one-per-session `navigator.storage.persist()` on first save; central error handling and Italian toasts; shell (router, nav, clock, cards, toasts, `ui.el`, `ui.scaricaBlob`, `ui.iconaAvviso`); accessible dialogs (`conferma`, `confermaElimina`, `modulo`); settings record |
| Domain | `js/dominio/{spesa,agenda,attivita,casa}.js` | pure rules, no DOM, no persistence |
| Services | `js/meteo.js`, `foto.js`, `archivio-foto.js`, `presentazione.js`, `backup.js`, `pwa.js` | logic only: Open-Meteo and LocalStorage copy; photo resize/thumbnails/object URLs; hand-written STORE ZIP with CRC32; slideshow; JSON backup, backup-reminder rule, factory reset; SW registration and "new version" toast |
| Sections | `js/sezioni/*.js` | the UI: each registers its page, dashboard card and settings group via `CasaNostra.ui.registraSezione/registraScheda/registraGruppoImpostazioni` (`sezioni/archivio-foto.js` and `sezioni/backup.js` hold the UI of the two services of the same name) |
| Start | `js/avvio.js` (last) | checks persistence, starts the UI, runs `CasaNostra.alPronto` callbacks |

CSS: `css/base.css` (variables), `layout.css`, `componenti.css`, `presentazione.css`, one file per section in `css/sezioni/`.

Data lives only in the browser: IndexedDB database with collections `prodotti`, `appuntamenti`, `attivita`, `promemoriaCasa`, `impostazioni` (single record, ADR-0001), `foto` (blob and thumbnail in the same record). LocalStorage holds only the last weather response, one key `casaNostra.meteo.copia` (the time of the last request lives inside that record). The weather card refreshes with a single 30-minute `setTimeout` that exists only while the page is visible; no `setInterval`. The backup contract (`app: 'casa-nostra'`, `schemaVersion: 1`, `dati: {...}`, photos excluded) is validated entirely before an all-or-nothing replace; the migration hook for older versions is in `js/backup.js`.

The dashboard draws every card in isolation: a failing card shows its error inside itself and the others keep working. `<html data-casa-nostra="pronta">` signals that a view has finished drawing (tests wait on it).

## Conventions

- User text goes into the DOM only through `textContent` (`ui.el(tag, { testo })`). `innerHTML` only for static internal markup; no `eval`.
- Adding a JS or CSS file: link it in `index.html` **and** add the same relative path to `RISORSE` in `sw.js` (icons and fetched resources too). The static and PWA tests fail if the lists diverge.
- `VERSIONE` in `sw.js` is raised only when publishing a release, never within a feature change. The cache is named `casa-nostra-<VERSIONE>`; activation deletes only other `casa-nostra-*` caches.
- Guarded APIs (Wake Lock, Service Worker, `createImageBitmap`, `navigator.storage`, `IntersectionObserver`) are feature-checked with a fallback.
- CSS must work in Chromium 80: no `inset`; `aspect-ratio` only behind `@supports not`; flex `gap` needs the margin fallback at the end of `css/componenti.css` (add new flex rows with `gap` there); focus rings use `:focus` plus `:focus:not(:focus-visible)`.
- No test-only switches in app code: tests reach the app from outside (e.g. `lib/benvenuto.js` seeds IndexedDB). The app never asks for notifications, location or camera permissions.
- The repo holds only code and static assets: never photos, backups (`casa-nostra-backup-*.json`) or archives (`*.zip`), which `.gitignore` excludes.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on `pk8646/home-sweet-home`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
