# Incident explorer frontend

Serve this directory from the local app's same origin. `index.html` loads `app.js`, `state.js`, and `styles.css`; requests use the settled `/api/incidents`, `/api/incidents/:id`, and `/api/export.csv` endpoints. No dataset or server is embedded in the frontend.

Search is submitted with Search or Enter. Facet, date, sorting, and page-size changes apply immediately and return to page one. Dates and displayed timestamps use UTC. The overview and daily counts describe the full matching result. While updating, the previous completed rows and summaries remain explicitly marked, and page controls are disabled. CSV exports the current applied selections and sort, across all pages; tags follow the API's JSON-array CSV representation.

Copy or bookmark the browser address to share the applied query, including sorting, page size and later pages. Reload and fresh tabs restore the results view. Back and Forward restore controls (discarding unsent drafts), rows and whole-result summaries; pending requests retain the previous snapshot as stale. Details and export activity do not create history entries. Invalid address values fall back to defaults; invalid dates clear and reversed date ranges clear both bounds. Unknown parameters are removed.

Named views persist the applied search, facets, dates, sorting, and page size in browser localStorage. Opening a view applies its selections together and returns to page one. Storage failures are visible and exploration remains available.

Service attention loads `/api/overview` independently, using the same search,
facets and inclusive UTC dates as the list. Cards compare all matching
incidents per service: total, unresolved (open/in progress), critical + high
(any status), and average elapsed resolution hours for resolved incidents
only. No resolved incidents means Unavailable. Cards sort by unresolved
descending then service name. Page/size/sort changes preserve the overview.
During a changed selection, previous measures are labeled with their original
filters. Token ownership rejects obsolete responses, errors and cleanup;
the overview has its own loading message and current-selection Retry.

Personal triage uses `triage.js` and a separate localStorage key, never the
URL, saved views or backend. Add/remove in full details, edit up to 1,000
plain-text characters per note in the workspace, or reopen canonical details
without changing results. Duplicate adds preserve the original note/order;
removal deletes the note. Recognition labels are snapshots from addition.
The list survives reload on the same origin unless browser data is cleared
or storage is unavailable. Malformed data is ignored with a visible message;
storage failures preserve this visit's in-memory list and notes and explain
that reload persistence is not guaranteed. All notes and incident text are
rendered as text. Cards and triage controls fit a narrow screen, with native
keyboard controls and visible focus.

The native details dialog supports keyboard dismissal, exposes every incident field as text, and restores focus to the incident on return. Results, detail sessions, and exports have separate ownership tokens. Each completion, error, and cleanup is gated; changed selections invalidate details and export downloads. Cancellation helps save work but tokens provide correctness. Download object URLs are released.

Run the repository's exact verification command from the checkout:

```sh
npm test
```

Discoverable tests under `tests/frontend/` exercise the actual DOM-free state module with direct events. These establish component behavior, including overlapping intents and retries; they do not establish real HTTP or browser integration. The integration suites run real sandbox-enabled Chromium against the existing backend and compare with an independent canonical-data oracle. See the root README for preparation, browser qualification and startup instructions.

Component review: `state.js` separates the requested intent from the last displayed snapshot and publishes rows and whole-result summaries atomically. Pending or stale queries lock pagination, and synchronous page transitions are clamped before dispatch. The UI retains the native modal and return target while detail ownership changes; it renders dataset values through text nodes. Independent operation tokens gate success, failure, and cleanup, and export gates download side effects after reading the response. This review establishes frontend structure and state behavior only.
