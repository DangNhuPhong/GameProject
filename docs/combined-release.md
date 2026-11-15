# Combined intro, credits and shop release

The working tree on v1.9 combines the changes from v1.8 with the shop branch. This is a content integration; no merge commit, push or deployment has been performed.

Included: cloud intro on entering/returning to the world map, world map music, revised classroom/farm assets, 120-credit progression with all five maps passed, per-map best results and retakes, online credit finalization, tutorial mode, character shop, demo top-ups and ownership checks for online/offline character selection. The selection highlight remains yellow and the actions remain Back / Continue.

Before using online credit progression, run `backend/sql/credits_progression.sql` in Supabase SQL Editor if it has not already been applied. Shop and demo top-up SQL remain as documented in `character-shop.md`.

Validation: frontend production build; credit progression/scoring/deadlines/retry tests; tutorial tests; ownership and character persistence tests; interaction and audio tests; backend syntax checks; Git whitespace check. These passed locally. Live Supabase transactions and the intro in a real browser were not exercised.

The four legacy map tests still fail at their strict raw-file frontend/backend comparison. Their JSON map inputs were not modified by this integration; the failures reflect existing formatting/metadata differences. These were not changed as part of this release.

To publish using GitHub Desktop: review all changed and added files on v1.9, commit them together, push, and merge the updated branch into the production branch. Deploy both frontend and backend from that combined revision. Promoting the earlier a9424cb preview alone does not contain this integration.
