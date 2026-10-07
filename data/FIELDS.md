# Dataset meanings

The file is a JSON array of exactly 2,400 fictional support incidents. It covers 90 UTC calendar dates beginning 2026-04-01. There is no personal or customer data.

Each incident has:

- `id`: unique stable text such as `INC-000001`.
- `title` and `description`: displayable plain text. Search examines these and the ID using case-insensitive literal matching. Some descriptions contain commas, double quotes, line breaks, and angle brackets; these remain text.
- `service`: one of Accounts, Billing, Search, Uploads, Notifications, Integrations.
- `severity`: critical, high, medium, or low, in that descending priority order. High-severity counts include critical and high.
- `status`: open, in_progress, or resolved. Unresolved means either open or in_progress.
- `openedAt`: an ISO UTC timestamp. Multiple incidents deliberately share timestamps.
- `resolvedAt`: an ISO UTC timestamp for resolved incidents; otherwise null.
- `team`: one of four fictional support teams.
- `region`: AMER, EMEA, or APAC.
- `tags`: an array of descriptive plain-text tags.

The full details view exposes all these fields. An opened-date filter compares UTC calendar dates, not the user's local timezone. CSV export contains every record field; tags may be represented as a documented textual list. CSV ordering follows the current sort and includes the complete matching result.

The generation recipe is the authoritative compact source. `.runtime/incidents.json` is a generated runtime artifact. Qualification records its complete byte count and SHA-256 and checks that the application leaves those bytes unchanged; a hash alone is not a claim that its full contents were supplied in a model prompt.
