# Swagger API documentation

Start the existing backend from `backend/` with `npm run dev` (or `npm start`).

- Swagger UI: `http://localhost:5000/api-docs` (use your configured PORT if different).
- OpenAPI 3.0.3 JSON: `http://localhost:5000/api-docs.json`.
- After deploying the backend, use the same paths on your backend's HTTPS domain.

No additional npm dependency or frontend build is required. The browser loads pinned
Swagger UI 5.17.14 CSS/JavaScript from unpkg.com; internet access to that CDN is
required for the UI. The OpenAPI JSON is served by the backend independently.
The server URL is relative (`/`), so Try it out targets the backend serving the docs.

## Try an endpoint

1. Open Maps -> GET /api/maps/{id}.
2. Click Try it out, select classroom and click Execute.
3. Inspect the status, response and generated curl command.

For match actions, use a real user ID with an existing profiles row. Create a room,
join with other players, set ready for all active players and start as the host.
Story hosts can then start an unlocked Story map. Requests execute real actions.

## Authentication

Sign in through the game. To obtain your own access token for testing, temporarily
inspect the `session.access_token` returned by the existing Supabase sign-in call
in your local development session. Do not commit or share the token.
Click Authorize in Swagger and paste only that user access token (no Bearer prefix).
Swagger supplies the Authorization header for operations marked with the lock icon.
Authorization is not persisted after reloading the page.

Never put the Supabase service role key or Cloudflare API token in Swagger.
The legacy create/join/ready/start endpoints currently take user_id in their body;
the documentation reflects their current behavior, without changing authentication.

## Scope and maintenance

`backend/src/config/openapi.js` describes all 16 existing HTTP operations, including
body fields, path parameters, schemas and controller response codes. Update this
file whenever a route/controller changes. `backend/src/config/swaggerPage.js`
contains the Swagger UI HTML; `backend/src/app.js` serves both documentation URLs.

Supabase Auth, shop/top-up/history RPCs and Socket.IO gameplay events are external
or event-based interfaces and are not advertised as Express HTTP endpoints.
`GET /api/test-db` is a static message, not a live database connectivity check.
