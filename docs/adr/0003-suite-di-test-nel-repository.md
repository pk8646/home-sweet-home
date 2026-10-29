# Suite di test nel repository

La suite di test (runner, server statico, `lib/`, `tests/`) sta nel repository, nella cartella `test/` alla radice, con un proprio `package.json` la cui unica dipendenza è `playwright-core` (pilota il Chrome installato, nessun download di browser). Prima viveva fuori dal repository, non versionata, con un'unica copia su un solo PC: da un altro dispositivo non si poteva eseguire il controllo di rilascio né modificare con sicurezza le parti coperte dai test.

## Conseguenze

- Il sito resta senza Node e senza build: Node serve solo a chi esegue i test, `npm install` si fa dentro `test/` e `node_modules/` è escluso da `.gitignore`.
- GitHub Pages pubblica con Jekyll: `_config.yml` alla radice esclude `test/`, così il sito pubblicato non serve nulla della suite.
- La radice del sito di default è la radice del repository (`node test/run.js` funziona da un clone senza opzioni); `--root` e `CASA_NOSTRA_ROOT` restano per provare un altro worktree.
- I controlli statici sui file del sito non considerano `test/` come risorsa dell'app.
