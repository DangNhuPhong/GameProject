# Selectable characters

Pepper, Mint, Sage and Phong share the same speed, hitbox and controls. Offline story shows a character picker before map selection inside the existing WorldMap page, with separate P1/P2 choices for local co-op. The confirmed lineup is saved with story progress in session storage and remains fixed across maps, returning to the world map and refreshing the page. Starting a new story from Play clears that lineup along with progress. Browser preferences only seed the next story's picker. Direct game links without a confirmed lineup return to the world page to choose first.

Online players open the picker using the button beside their own name in the lobby before Ready. It stays closed by default; skipping selection uses Pepper for a new room. No character-selection page or frontend route is needed.

Online players choose in the lobby before Ready. `PATCH /api/matches/:roomCode/character` uses the signed-in user's token, checks active room membership and validates the character ID. The room API includes each player's `character_id`; `character-selected` broadcasts lobby updates. The game receives the authoritative `character-roster` at join/reconnect, and position packets carry the server's character ID for remote rendering. A roster includes known positions so a joining player can see teammates already standing still.

Selections are stored separately from round state in `backend/data/characters.json`, keyed by match ID and user ID. No database schema change is needed. On deployment, keep this directory on a persistent writable volume, or set `CHARACTER_STORE_PATH` to an absolute persistent file path. This file store is intended for one server process; multiple server instances should use shared database storage instead.

Add characters in `frontend/src/game/characters.js` and the backend `CHARACTER_IDS` allowlist. Every sheet is 512×480: four 128×160 frames per row, rows down/up/left, idle/step/idle/step; right-facing uses horizontal flipping. Portraits use the first frame. Generated source art is extracted with `tools/prepare_characters.py`.

Validation: `node tools/test-characters.mjs`, `node tools/test-item-interaction.mjs`, and `npm run build` in `frontend`.

Phong uses a teal polo, cream trousers and parted brown hair based on the provided reference photographs. Phong wears a single stud on his anatomical left ear (viewer-right in front view). His sheet is 512×640: the third row is the studded left profile and the fourth row is a bare-ear left-oriented profile mirrored for right-facing movement. Front and back views explicitly clear horizontal flipping so walking sideways cannot swap the stud. Prepare it with `python tools/prepare_characters.py <source.png> phong --asymmetric`.

Faker uses the approved wheelchair design with six stars in an arch and the supplied red emblem on his jersey and chair back. His 512x640 sheet has separate front, rear, left and right rows; side views show the stars edge-on. Rebuild the transparent assets with tools/prepare_faker.py and the approved four-view concept. Movement uses a subtle seated rolling bounce.
