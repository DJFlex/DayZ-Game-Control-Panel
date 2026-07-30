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
- **Everything through `0b77506` is LIVE.** Tower booted the mod-tabs exe at 22:03:25 on 2026-07-30, clean log. Rollback = `dayz-server-manager.exe.PREV-MAPMERGE`. The Map merge before it was eyeballed and confirmed ("looks great").
- Deployed in order, 2026-07-30: ID-Tools/confirms (11:49) → degraded states (15:32) → Logs+Audit (15:49) → Settings save bar (21:09) → Map merge (21:30) → mod tabs + setting search (22:03). Each has a `.PREV-*` exe beside it on the tower.
- **NEXT ACTION:** nothing pending build or deploy. Pick from "NOT done" below.
- ⚠ **A preview is not a deploy.** Showing a rendered preview and moving on reads as "it shipped" — the user hunted for the merged Map on an exe built before the commit. Say plainly when something is only committed.

## DONE + LIVE (matched to designer)
Shell (sidebar **MONITOR/MANAGE/CONFIGURE** + active pill; top bar), Dashboard stat tiles (ring gauges; amber "Starting"), Maintenance (task-card grid, lock→switches, RCON console, one-click **Stop for Maintenance**, confirm on destructive actions), Players table (flag badges) + ID Tools moved below list, Audit (action badges), Logs (severity colouring), Login (branded), **IBM Plex fonts bundled**, Settings (left section-nav, one section at a time). Also: **server auto-update** enabled (`steamUsername:"flexsoft"`, `updateServerBeforeServerStart:true`), and `STOP-SERVER.bat` / `START-SERVER.bat` helper bats on the tower.

## Also DONE + LIVE (this session, newest first)
- **Settings mod tabs + file-only note + setting search** (`0b77506`). Mods: three stacked lists → tabs with counts (Workshop / Local Paths / Server Mods), add-by-ID accepting a bare Workshop ID **or** a pasted Steam Workshop URL, disabled checkbox → switch with the row dimmed + badged. ⚠ **A `steamWsMods` entry is either a bare id string or a `{workshopId,name,disabled}` descriptor** — the schema allows both and real configs use both; every accessor copes with either and only promotes a string when there is something extra to store, so a plain id list stays a plain id list. Web/Events/Hooks/Metrics sections **deleted** (their whole content was the words "currently only in file") → one line under the nav naming them + a File Editor link. Search now matches config keys and their labels, not just section names, and names the matching field under the section; the index is **hand-maintained** in `SECTION_KEYS` (harvested from the template) — a new field is not searchable until listed there. Server.cfg fills in from `serverCfgProps`.
- **Map + MapLoot merged** (`e8e5424`). One page, five toggle pills (Locations/Players/Vehicles/Loot clusters/Events) with marker counts; map fills the pane, controls float over it; Leaflet's own layers control removed. MapLoot gone from the sidebar, `/dashboard/map/maploot` redirects. **Loot + Events are lazy** — off by default, mission file fetched on first switch-on (mapgrouppos.xml can be thousands of positions); a failed fetch turns the pill back off. Editing preserved in full (drag / Delete / double-click-to-add / Save writes cfgeventspawns.xml + mapgrouppos.xml), and the edit bar only appears once a file is loaded. Dropped the dead "Restart Server" checkbox (its code was commented out).
- **Settings save bar + flag cards** (`d0939f7`). Bar names the changed fields and disables when clean; Reset → **Discard**. Change detection **compares against the loaded config, not `configForm`** — every array editor binds `standalone: true` so form dirty flags can't see mods/admins/discord. Baseline snapshot is taken *after* `reset()` normalises discordChannels, and refreshed on save. Startup flags → toggle cards; **the descriptions are hand-written**, the schema's are just "Server Startup Param doLogs".
- **Logs + Audit** (`92a78a4`). Logs: filter box, "Errors only", explicit **Follow** switch (was a bare lock icon), Download (saves the browser's buffer, not the disk file — tooltip says so), footer with follow state / line count / error+warning totals / Jump to latest. Audit: action dropdown built from the actions present in the log, search moved into the card header, "N events · page X of Y", no-match state.
- **Degraded states** (`47c3fbc`). `AppCommonService` publishes `connectionState` (`connecting`/`online`/`offline`) + `lastSuccessAt`, fed by a result callback on every `ApiFetcher`; only flips offline after a whole cycle fails. `sb-status-banner` (app-common, exported) = amber reconnecting banner w/ Retry + data age, or red server-stopped banner w/ Open Maintenance; dates the stop from metric history, silent when it can't prove when. On Dashboard, Players, Audit. `.dz-skel` shimmer in `_global.scss` (custom props, dark restated in `_theme.scss`). Players empty state with three wordings.

### Bugs fixed in passing (all pre-existing)
- Dashboard `<sb-player-table>` had **no inputs bound** → that card always drew an empty table.
- Players tile read the last-ever RCON list → kept showing pre-shutdown players; now 0 unless STARTED.
- Map `updatePlayers`/`updateVehicles` pushed a new marker per entity **per poll** while only removing departed ones → markers stacked up, `markers` grew unbounded. Both layers rebuilt per poll now.
- …and consequently an active map search was dropped seconds after typing; the term is kept and re-applied after each rebuild.
- Map Delete-key removal left the marker in the `markers` array.
- Audit paging: changing the search left you on a now-nonexistent page (blank table until you clicked page 1). Search + action filter reset to page 1.
- Server.cfg settings section had a duplicate Submit/Reset pair.
- The three mod lists hold **primitives**, so Angular's default identity tracking treated an edited entry as a new one and rebuilt the row — stealing focus after every keystroke. All three now `trackBy: trackByIndex`. Watch for this in any other list of strings.
- Adding a local/server mod path threw when the key was absent from the config.

## NOT done / next work
- **Types** + **File Editor** — only inherit shared theme; not matched to designer frames. Biggest remaining item.
- **Admins table** — designer frame shows a proper table (user id / level badge / masked password / delete) with a warning callout. Today it is bootstrap rows; the warning callout is already there.
- **System page** — designer wants Host + DayZ + Manager process cards (CPU/RAM). Panel only collects HOST stats → per-process is **data-blocked**. Could restyle the 2 host charts only.
- **Light-theme parity** — redesign is dark-first; some component scss hardcodes dark. User runs dark, so low priority.
- **Status banner on Logs** — skipped: that page is a `h-100` full-height card a banner would push out of the viewport. (Map is now unblocked for one, since the merge rebuilt its layout.)
- **Logs exception callout boxes** — designer groups multi-line exceptions into a red box. Needs variable row heights, which breaks `cdk-virtual-scroll`'s fixed `itemSize`. Severity colouring already reds those lines.
- **Stopped-tile `since` sub-line** — skipped; only one of four dashboard tiles has a sub-line in the frame and the banner already carries the time.
- Two stray files on disk: `map-loot.component.{ts,html}.merged-into-map`. Renamed rather than deleted (env blocks deletes under `D:\DayZ`); git has them deleted, so they are safe to remove by hand.

## Acceptance checklist (designer's own)
Every box is ticked except **"light + dark themes both coherent"** — the redesign is dark-first and several component scss files hardcode dark values. The user runs dark, so this is cosmetic for them but would matter for a wider release.

## Gotchas (learned the hard way)
- **`serverCfg` is NULL on this tower by design.** Any Settings template binding to `config.serverCfg.X` throws every change-detection cycle and breaks the WHOLE component (symptom: unrelated bindings render blank — e.g. the empty section-nav). Guard with `*ngIf="config.serverCfg"`. **When a render looks broken, get the browser console FIRST** (have the user export the console log or run a one-line `alert(...)`) before guessing — it names the error instantly.
- `fa-icon [icon]` needs a **tuple**, not `string[]` — inline the ternary in the template, don't return `string[]` from a method.
- **`ApiFetcher` swallows fetch errors** (`catchError` → `of(null)`), which is *why* stale data survives an outage — the `BehaviorSubject` simply never gets a new value. That also means a failure is invisible unless you report it; hence the `onResult` callback.
- Wrapping a block in `*ngIf="d.sysw; else …"` **narrows the type**, so every `d.sysw?.x` inside it becomes a redundant-optional-chain warning (NG8107). Switch to plain dots inside the guarded block or the build gets noisy.
- `.p-flow` on the Players page is a flex column with `.p-idtools { order: 2 }` — put anything new **outside** it, or the reorder swallows it.
- `ng build` output is the cheap check: it reports template type errors AND the NG81xx warnings. `ui` has no `lint` target (`ng lint` fails) — don't chase it.
- **`strictTemplates` is on.** To index `config` by a variable key in a template, type the key as a literal union (see `StartFlagKey`), not `string`.
- **Array editors bind `standalone: true`**, so they never register with the surrounding `NgForm`. Anything that reasons about "what changed" must compare values, not read `form.controls[].dirty`.
- **Read the page before believing the handoff.** Twice this session an item listed as "not done" was already built (the sticky save bar; the section search) and one "free from the schema" turned out to be worthless boilerplate. Open the file first.
- **Previewing component scss standalone:** strip the line-1 `@import 'styles/variables.scss'`, and rewrite `:host-context(html[data-theme='dark'])` → `html[data-theme=dark]` or the dark rules match nothing. Fonts base64-inline from `ui/src/assets/fonts`.
- `git commit -m @'...'@` (PS here-string) **breaks when the message contains double quotes** — the native-arg encoder re-parses them. Write the message to a file and use `git commit -F`.
- Register new FontAwesome icons in `ui/src/modules/icons/icons.font-awesome-solid.ts`.
- Keep white-label vars (`--brand-*`). Dark tokens: page `#1b1e24` · card `#262b33` · raised `#2d333d` · border `#3a414d` · text `#e6e8eb` · muted `#9aa2ad` · accent `#57a6ff` · green `#3fb950` · red `#f16b79` · amber `#ffc107`. Fonts: IBM Plex Sans / Mono.
- **User has ADD + dyslexia** → keep chat replies very SHORT; guide tower actions ONE step at a time.
