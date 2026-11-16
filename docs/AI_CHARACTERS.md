# AI characters with Cloudflare Workers AI

Cloudflare Workers AI is the only provider. OpenAI integration and head-only/Pepper-body composition have been removed.

## Configure

Keep these backend variables locally in backend/.env and on Render:

```dotenv
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_workers_ai_token
AI_CHARACTER_COST=500
```

Existing Supabase settings are still required. AI_CHARACTER_PROVIDER and OPENAI_* variables are no longer used. Never put provider secrets in frontend/Vite variables or git. Restart the backend and reload/update the frontend after changing the code/configuration. No new SQL migration is required for this cleanup.

For a new installation, run backend/sql/character_shop.sql, then backend/sql/custom_characters.sql. The temporary hourly-limit removal for existing databases is backend/sql/disable_character_hourly_limit.sql.

## Generation

1. Player chooses a JPG/PNG/WebP photo up to 20 MB. The browser applies orientation, preserves aspect ratio and renders a 480x480 PNG with white padding. The backend independently validates and normalizes it. Direct API image inputs remain limited to 5 MB and 20 megapixels.
2. Cloudflare creates ONE standing full-body design from the uploaded photo. No existing game character/style artwork is sent. The design is normalized to a 480x480 reference.
3. Eight additional full-body poses are generated independently: front step A/B, back idle + step A/B, and left idle + step A/B. Back/left idle use the original generated design; their steps use that direction's generated idle plus an anonymous gray single-pose guide. Every output is a full body, not an isolated head.
4. Code assembles three rows `[idle, step A, idle, step B]`, sharing the idle pixels exactly. All poses share scale and ground baseline. Output is a transparent 512x480 sheet and a 128x160 portrait. No existing Pepper body is composited into the result.

Normal creation uses NINE Cloudflare calls, at most TEN with one shared structural retry. Completed poses stay in memory while retrying only the failed pose. Quota, capacity, network and safety errors do not trigger automatic retries. Source/intermediate images normally remain in memory; only the final sheet and portrait are uploaded. Local opt-in AI_CHARACTER_DEBUG_IMAGES=true retains only the latest rejected generated pose at output/ai-character-debug/last-failed-sheet.png and its diagnostic JSON. Turn off local image diagnostics in production.

## Coins and saved characters

One complete creation costs AI_CHARACTER_COST (500 coins by default), reserved atomically before generation. Errors refund the reservation and keep the previous character. One job per account and two concurrent jobs per backend process are allowed. Interrupted jobs older than 30 minutes are refunded by maintenance/status checks. Closing Shop does not stop a running job; reopening resumes polling.

Successful replacement atomically changes the active sprite version and then cleans old files. Generation UUIDs prevent stale image URLs. Existing saved characters (including previously created head/body composites) remain playable until replaced; removing a generation mode does not delete user progress, purchased chefs or database records.

## Errors and quality

HTTP 429 is not automatically treated as daily quota exhaustion: 3036/4006 indicate daily allocation, 3040 indicates provider capacity, and an unspecified 429 means request limiting without proof of daily exhaustion. Provider errors include available codes. Safe logs record status, codes, classification and provider request identifiers, not secrets or raw payloads.

Structural validation checks usable figures, spacing and clipping. It cannot guarantee likeness, pixel style, correct facing or smooth motion. Evaluate live Cloudflare output before public release.

## Verification

Run from repository root:

- node tools/test-cloudflare-character-pipeline.mjs
- node tools/test-custom-character-images.mjs
- node tools/test-custom-character-api-client.mjs
- node tools/test-cloudflare-errors.mjs
- node tools/test-custom-character-api.mjs (local HTTP integration with mocked database/provider)

These tests do not spend real Cloudflare quota. Build frontend with npm run build from frontend. The cleanup does not require installing dependencies.
