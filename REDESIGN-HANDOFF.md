# RoZebud DZSM Panel — Redesign Handoff

Pick-up notes for continuing the GUI redesign in a fresh conversation.

## Where things are
- **Fork/repo:** `P:\tools\dayz-server-manager`. Deploy branch = **`rozebud/v3.10.0-fixes`** (current HEAD `9472772`). Pushed to `github.com/DJFlex/DayZ-Game-Control-Panel` (remote `djflex`).
- **UI source:** `ui/src/modules/` · global styles `ui/src/styles/` (`_theme.scss`, `_fonts.scss`, `styles.scss`).
- **Designer references:** `…/scratchpad/redesign2/handoff/` (from `Downloads\Maintenance page redesign concepts.zip`). Main file **`RoZebud Panel Redesign.dc.html`** — one frame per page; **`HANDOFF.md`** = full designer spec/tokens/IA.
- **Tower:** `T:\dayzserver\dsm` · panel at `http://192.168.0.163:2313`.

## Build + deploy routine
1. **Build exe:** run `Build.ps1` in PowerShell **plain** (do NOT pipe `*>&1` — it makes npm stderr trip the script). ~5–8 min → `build\dayz-server-manager.exe` (218 tests, functions 100%).
2. **Deploy** (server empty): rename tower exe aside (`dayz-server-manager.exe.PREV-<x>`), copy new exe to `T:\dayzserver\dsm\dayz-server-manager.exe` (works over the `T:` share), then the user runs **`APPLY-NEW-VERSION.bat`** as admin. Needed because the `RoZebudPanel` scheduled task relaunches the manager every 5 s (can't just close it). Rollback = restore a `.PREV-*` exe + re-run the bat.
3. **Verify UI:** `cd ui && ng build` catches template errors. For a visual check before deploy: `sass --no-source-map` the component scss (strip the line-1 bootstrap `@import`), hand-build a static preview HTML with sample data, `SendUserFile(display:render)`. Behind-auth pages: deploy + user eyeballs.

## Deploy state RIGHT NOW
- **ID-Tools build is LIVE.** Deployed 2026-07-30; new manager booted 11:49:59 and was exercised from the panel (admin login → Stop for Maintenance) — so confirms + the ID-Tools reorder are verified in the wild. Rollback exe on the tower = `dayz-server-manager.exe.PREV-CONFIRMS`.
- **Degraded states are committed but NOT deployed** — `ng build` is clean, exe build was in flight when this was written.
- **NEXT ACTION:** build an exe from `rozebud`, swap it onto the tower, user runs `APPLY-NEW-VERSION.bat`. The server is currently stopped, so the red banner + Players empty state show up immediately.

## DONE + LIVE (matched to designer)
Shell (sidebar **MONITOR/MANAGE/CONFIGURE** + active pill; top bar), Dashboard stat tiles (ring gauges; amber "Starting"), Maintenance (task-card grid, lock→switches, RCON console, one-click **Stop for Maintenance**, confirm on destructive actions), Players table (flag badges) + ID Tools moved below list, Audit (action badges), Logs (severity colouring), Login (branded), **IBM Plex fonts bundled**, Settings (left section-nav, one section at a time). Also: **server auto-update** enabled (`steamUsername:"flexsoft"`, `updateServerBeforeServerStart:true`), and `STOP-SERVER.bat` / `START-SERVER.bat` helper bats on the tower.

## DONE, awaiting deploy
- **Degraded states** (designer frames 2b/3b). `AppCommonService` now publishes `connectionState` (`connecting`/`online`/`offline`) + `lastSuccessAt`, fed by a result callback on every `ApiFetcher`. New `sb-status-banner` (app-common, exported) renders the amber "Connection lost — reconnecting…" banner (with a Retry button and the age of the data on screen) or the red "Server process is stopped" banner (Open Maintenance). On Dashboard + Players; **not** on Map — `.map-container` uses `calc()` height math a banner would push out of the viewport, so that waits for the Map merge.
- **Skeletons.** `.dz-skel` + `@keyframes dz-shimmer` live in `_global.scss` with `--dz-skel-base/-hi` custom props; `_theme.scss` restates them for dark. Used by the dashboard tiles (first load) and the player table.
- **Players empty state** — icon + reason + "Go to Maintenance", with three wordings: search-filtered, server stopped, server up but quiet.
- **Bug fixed:** the Dashboard's `<sb-player-table>` had **no inputs bound**, so that card always drew an empty table. Now bound to `players$`/`total$`. Also the players tile read the last-ever RCON list, so it kept showing pre-shutdown players — it now reads 0 unless the state is STARTED.

## NOT done / next work
- **System page** — designer wants Host + DayZ + Manager process cards (CPU/RAM). Panel only collects HOST stats → per-process is **data-blocked**. Could restyle the 2 host charts only.
- **Map + MapLoot merge** — one Map page with layer-toggle pills (Players/Vehicles/Loot/Events), full-viewport map, remove MapLoot from sidebar. (Two separate Leaflet components today.) Also unblocks the status banner there.
- **Types** + **File Editor** — only inherit shared theme; not matched to designer frames.
- **Logs** — add RPT/ADM/Script tabs + filter box + rename lock icon to a "Follow" switch (severity colour is done).
- **Audit** — add an action filter dropdown (badges done).
- **Settings deeper** — mods as a structured list (not JSON), startup flags as toggle cards, file-only sections (Web/Events/Hooks/Metrics) link to File Editor, sticky bar that names unsaved fields.
- **Light-theme parity** — redesign is dark-first; some component scss hardcodes dark. User runs dark, so low priority.

## Gotchas (learned the hard way)
- **`serverCfg` is NULL on this tower by design.** Any Settings template binding to `config.serverCfg.X` throws every change-detection cycle and breaks the WHOLE component (symptom: unrelated bindings render blank — e.g. the empty section-nav). Guard with `*ngIf="config.serverCfg"`. **When a render looks broken, get the browser console FIRST** (have the user export the console log or run a one-line `alert(...)`) before guessing — it names the error instantly.
- `fa-icon [icon]` needs a **tuple**, not `string[]` — inline the ternary in the template, don't return `string[]` from a method.
- **`ApiFetcher` swallows fetch errors** (`catchError` → `of(null)`), which is *why* stale data survives an outage — the `BehaviorSubject` simply never gets a new value. That also means a failure is invisible unless you report it; hence the `onResult` callback.
- Wrapping a block in `*ngIf="d.sysw; else …"` **narrows the type**, so every `d.sysw?.x` inside it becomes a redundant-optional-chain warning (NG8107). Switch to plain dots inside the guarded block or the build gets noisy.
- `.p-flow` on the Players page is a flex column with `.p-idtools { order: 2 }` — put anything new **outside** it, or the reorder swallows it.
- `ng build` output is the cheap check: it reports template type errors AND the NG81xx warnings. `ui` has no `lint` target (`ng lint` fails) — don't chase it.
- Register new FontAwesome icons in `ui/src/modules/icons/icons.font-awesome-solid.ts`.
- Keep white-label vars (`--brand-*`). Dark tokens: page `#1b1e24` · card `#262b33` · raised `#2d333d` · border `#3a414d` · text `#e6e8eb` · muted `#9aa2ad` · accent `#57a6ff` · green `#3fb950` · red `#f16b79` · amber `#ffc107`. Fonts: IBM Plex Sans / Mono.
- **User has ADD + dyslexia** → keep chat replies very SHORT; guide tower actions ONE step at a time.
