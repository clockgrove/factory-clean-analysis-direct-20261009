# Synthetic support-incident explorer

A local incident explorer for 2,400 fictional support incidents. Search IDs, titles and descriptions; combine service, status, severity and inclusive UTC date filters; inspect complete details; and export the entire matching result. The Node server serves both the browser interface and the read-only HTTP API on loopback.

Use Node.js 24. From the checkout directory, generate the canonical dataset and start the application:

```sh
npm run seed
npm run start
```

Open **http://127.0.0.1:3000**. Stop the foreground application with **Ctrl+C**; the server also handles SIGTERM. To choose another loopback port, use `PORT=3001 npm run start` (on POSIX shells). The application reads `.runtime/incidents.json`; it does not modify incidents. See `data/FIELDS.md` for field meanings.

An address without query parameters has no filters, sorts newest first and displays 25 incidents per page. Multiple choices within one facet match any selected value; different facets and search match together. Sorting, filtering and search reset to the first page. Summary counts and daily chart text cover every matching incident, including later pages. Opening and closing details preserves the results and restores keyboard focus. During requests, previous results are marked as previous and their actions are disabled. A failed request preserves selections; Retry uses the current context.

Saved views remember the search, facets, UTC dates, sort direction and page size, and reopen at page one. They persist in this browser's local storage for the same origin; changing the hostname or port uses a different storage origin. The address always records the applied search, including the page. Copy it to share, bookmark it, reload it or open it in a fresh tab to restore controls, rows and whole-result summaries. Back and Forward restore earlier applied searches and discard unsent search text; details close and obsolete requests cannot change the restored view. Typing alone does not change the address. Reloading restores the address; saved views remain available through their named Open buttons. Delete removes it from storage. If storage is unavailable, the interface reports that views last only for the current visit. No account or external service is involved.

Download CSV exports all matching incidents in the selected order. The header contains all eleven dataset fields. Null `resolvedAt` values become empty cells; `tags` contains a JSON array of strings. CSV uses CRLF record separators and double-quoted cells with doubled internal quotes where needed, preserving commas, quotes and description line breaks.

Service attention compares services across the entire filtered result using the local `/api/overview` endpoint. It shows incident count, unresolved count (open or in progress), critical + high count (any status), and average hours from opening to resolution for resolved incidents only. If none resolved, the average is **Unavailable**. Services sort by unresolved count descending, then name. Pagination, page size and incident sorting do not change these measures. The overview labels the requested selection and any previous measures during loading or failure; its Retry uses the current filters independently of the list.

Personal triage sits above the incident list. Open full details to add or remove an incident; reopen details from triage without changing search results. Incidents appear once, in addition order. Notes are plain text, up to 1,000 characters, and save as you type. Removing an incident deletes its note. Membership, recognition labels and notes use a separate localStorage key (`incident-explorer.triage.v1`), independent of saved views and addresses. Labels are snapshots from addition; full details always come from the canonical backend. Triage is personal to this browser and origin, with no account, synchronization or external requests. Clearing browser data removes it. If stored triage is malformed it is ignored with a visible explanation, and a new list can be saved. If storage reads or writes fail, exploration and this visit's triage remain usable, but persistence across reloads is not guaranteed.

For verification in the supplied qualification environment, run these commands in order from this checkout:

```sh
npm run pretest
qualification-browser-smoke
npm test
```

The preparation command installs the pinned tooling if needed and regenerates/checks the canonical dataset. The smoke probe qualifies real sandbox-enabled Chromium and loopback HTTP only. `npm test` repeats preparation and discovers component and integration tests with Node's built-in runner. Integration tests compare actual HTTP and browser results against an independent oracle built from the canonical data, exercise the startup command, and cover saved views, keyboard and phone layouts, loading, empty results, connection failure/retry and overlapping intent transitions. They start owned loopback servers and close servers, browsers and subprocesses in cleanup paths. The browser suite uses the alias-relative installed browser and library paths described below; profiles, downloads and other runtime evidence stay under ignored `.runtime/`.

The additional workspace checks cover service measures through actual HTTP (including filtered matches across pages, unavailable averages and empty results), and real Chromium overview updates, overlapping selections, server outage/retry, triage notes/reload/reopening/removal, denied or malformed storage, and keyboard/phone layouts. Existing regression suites remain part of the same `npm test` command. All application and verification servers bind loopback, and tests close their owned browsers and servers.

## Exact shared commands

Generate the supplied canonical data:

npm run seed

Run complete verification, including meaningful application HTTP and browser checks you add:

npm test

The baseline uses Node's built-in `node:test` runner (generic `node --test` discovery). Its immutable data prerequisite runs before the test suite and installs the exact pinned development tooling with package lifecycle scripts disabled when needed. Keep the seed, pretest and test script bodies unchanged; add application verification in locations the generic Node test runner discovers. The initial passing data/tooling prerequisite is a tooling/data prerequisite, not application acceptance. Preserve `scripts/prepare.mjs` and the two `data/*` sources. Add the app, its startup instructions and meaningful real HTTP/browser verification without replacing these checks. Choose application architecture, API, UI and work breakdown freely.

Declare and implement a local startup script for this exact command, then document the actual URL/port and shutdown procedure:

npm run start

## Installed browser environment

All arms use the same pinned Playwright 1.64.0 and sandbox-enabled headless Chromium 156.0.8078.4. The provided package lock pins the Node browser tooling. Before importing Playwright for browser tests, set `PLAYWRIGHT_BROWSERS_PATH` to the provided browser directory. Use `{channel:'chromium', headless:true, chromiumSandbox:true}`; never add `--no-sandbox` or relax controls to pass a test.

The qualification host exposes the real `qualification-chromium` executable through a dedicated read-only tool prefix on PATH. Locate its alias using `command -v qualification-chromium`; the alias directory contains no application or account data. The browser directory is `../browsers` and the local library directory is `../host-libs/usr/lib/x86_64-linux-gnu` relative to that alias directory. Resolve those local tooling paths dynamically; do not hardcode a contributor workspace path in application code. Pass that library directory as `LD_LIBRARY_PATH` in Chromium's explicit child environment, with `ALSA_CONFIG_PATH` pointing to `../host-libs/usr/share/alsa/alsa.conf`. Do not assume arbitrary inherited environment variables survive worker isolation. Browser profiles and temporary files belong under the current checkout's ignored `.runtime/`; an explicit relative `TMPDIR='.runtime/browser-tmp'` (also TMP/TEMP) avoids Chromium's Linux socket-path length limit while keeping files in that workspace. Create that directory before launch, preserve the current checkout as cwd, and close the browser and any owned HTTP server in finally blocks. The controller's later shared screenshot assessment uses its independently proved short alias, retained separately.

Run actual local HTTP requests and real browser interactions against your implemented backend. Include data/sort/filter/pagination/whole-result-summary/details/export correctness and the human Objective's saved-view, keyboard, responsive, loading, empty, genuine failure and retry journeys. Do not mock or replace responses, generate screenshots of an imagined app, or treat this browser prerequisite as proof of application acceptance. Tests and app-local screenshots may use ignored `.runtime/`; commit source/verification/startup instructions, not runtime profiles or node_modules. Report an exact environment limitation if a required operation remains unavailable.

The same dedicated tool prefix also provides this actual browser/HTTP prerequisite command, after the data/tooling prerequisite has installed Playwright:

qualification-browser-smoke

It starts and closes a tiny real loopback HTTP page and sandbox-enabled Chromium, records actual process identities/launch argv and closure under ignored `.runtime/`, and reports the receipt path. It verifies the installed browser environment; it never supplies the application's behavior, design, API or passing acceptance.
