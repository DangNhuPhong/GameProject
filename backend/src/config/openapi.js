// Keep this specification aligned with routes and controllers. No credentials belong here.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ "application/json": { schema } });
const response = (description, schema = ref("Error")) => ({ description, content: json(schema) });
const body = (schema) => ({ required: true, content: json(schema) });
const object = (properties, required = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });
const string = (example) => ({ type: "string", ...(example !== undefined ? { example } : {}) });
const uuid = { type: "string", format: "uuid" };
const mapIds = ["classroom", "farm", "sports", "computer-room", "library", "kitchen"];
const mapId = { type: "string", enum: mapIds, example: "classroom" };
const authenticated = [{ bearerAuth: [] }];
const roomParameter = {
  name: "roomCode", in: "path", required: true,
  description: "Room code returned when creating a match.", schema: string("Z7PCXR"),
};
const envelope = (data) => object({ success: { type: "boolean" }, message: string(), data });
const errors = (...codes) => Object.fromEntries(codes.map((code) => [code, response({
  400: "Invalid input or room not ready.", 401: "Missing or invalid Supabase access token.",
  403: "Permission denied, character not owned, or Story map locked.", 404: "Resource not found.",
  409: "Room or round state conflicts with this action.", 500: "Server or database error.",
  503: "Required service is unavailable or not configured.",
}[code])]));
const operation = (operationId, summary, tags, responses, extra = {}) => ({
  operationId, summary, tags: [tags], responses, ...extra,
});
const matchResponse = response("Match information.", envelope(ref("Match")));
const playerResponse = response("Room player information.", envelope(ref("Player")));

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "OverNauAn / Kitchen Panic API", version: "1.0.0",
    description: "HTTP API for rooms, recipes, maps and AI characters. Use Try it out to send real requests. " +
      "Create room -> join -> ready -> start; Story hosts then start a Story round. " +
      "For protected operations, sign in through the game and paste your Supabase access token into Authorize (without the Bearer prefix). " +
      "Legacy create/join/ready/start endpoints use user_id in the body and do not currently verify a Bearer token. " +
      "Supabase Auth, shop/history RPCs and Socket.IO events are separate interfaces, not Express routes listed here.",
  },
  // Relative URL works on localhost and Render without embedding a deployment hostname.
  servers: [{ url: "/", description: "Current backend (local or deployed)" }],
  tags: [
    { name: "System", description: "Backend availability." },
    { name: "Maps", description: "Tiled JSON map files." },
    { name: "Recipes", description: "Recipes stored in Supabase." },
    { name: "Matches", description: "Rooms, players, lobby and game mode." },
    { name: "Story", description: "Host-controlled timed Story rounds." },
    { name: "AI Characters", description: "Authenticated Cloudflare character generation. Creation spends coins." },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Supabase user access token, not a service role key." } },
    schemas: {
      Error: object({ message: string("Room not found"), success: { type: "boolean", example: false }, debug: { type: "object", additionalProperties: true } }, ["message"]),
      Match: { ...object({
        id: uuid, room_code: string("Z7PCXR"), host_id: uuid,
        status: string("WAITING"), map: string("Kitchen_1"), max_players: { type: "integer", example: 4 },
        game_mode: { type: "string", enum: ["STORY", "FREE"] }, current_map: mapId,
        story_total: { type: "number" }, story_credits: { type: "object", additionalProperties: { type: "number" } },
        round_status: string("IDLE"), round_id: { ...uuid, nullable: true }, round_score: { type: "number", nullable: true },
        started_at: { type: "string", format: "date-time", nullable: true },
        players: { type: "array", items: ref("Player") }, host: { type: "object", nullable: true, additionalProperties: true },
      }), additionalProperties: true },
      Player: { ...object({
        id: uuid, match_id: uuid, user_id: uuid, ready: { type: "boolean" },
        score: { type: "number" }, orders_completed: { type: "integer" }, coins_earned: { type: "number" },
        joined_at: { type: "string", format: "date-time" }, left_at: { type: "string", format: "date-time", nullable: true },
        character_id: string("pepper"), custom_character: { ...ref("CustomCharacter") },
        profiles: { type: "object", nullable: true, additionalProperties: true },
      }), additionalProperties: true },
      Recipe: {
        type: "object", additionalProperties: true,
        description: "Database recipe row plus nested recipe_materials/materials and processing_steps. Extra database columns are preserved.",
        properties: {
          recipe_materials: { type: "array", items: object({
            id: {}, quantity: { type: "number" }, materials: object({ id: {}, name: string(), image: { type: "string", nullable: true }, type: string() }),
          }) },
          processing_steps: { type: "array", items: object({ id: {}, step_order: { type: "integer" }, action: string(), duration: { type: "number" } }) },
        },
      },
      CustomCharacter: { ...object({
        id: string("custom:USER_UUID"), name: string("My AI Chef"), description: string(), spriteKey: string(), color: string("#f4bd67"),
        version: uuid, sheet: { type: "string", format: "uri" }, portrait: { type: "string", format: "uri" },
      }), nullable: true },
      GenerationJob: { ...object({
        id: uuid, status: { type: "string", enum: ["processing", "completed", "failed"] },
        cost: { type: "integer" }, message: { type: "string", nullable: true }, created_at: { type: "string", format: "date-time" },
      }), nullable: true },
    },
  },
  paths: {
    "/": { get: operation("getHealth", "Check backend availability", "System", {
      200: response("Backend is running.", object({ message: string("Kitchen Panic API is running") })),
    }) },
    "/api/test-db": { get: operation("getDatabaseReadiness", "Read database readiness message", "System", {
      200: response("Static readiness message.", object({ success: { type: "boolean", example: true }, message: string("Database API is ready") })),
    }, { description: "This endpoint returns a static message. It does not query or verify the database connection." }) },
    "/api/maps/{id}": { get: operation("getMap", "Download a Tiled map JSON", "Maps", {
      200: response("Raw Tiled JSON, without a data envelope.", { type: "object", additionalProperties: true }),
      404: { description: "Unknown map ID.", content: { "text/plain": { schema: string("Not Found") } } },
      ...errors(500),
    }, { parameters: [{ name: "id", in: "path", required: true, schema: mapId }] }) },
    "/api/recipes": { get: operation("getRecipes", "List recipes with ingredients and steps", "Recipes", {
      200: response("Recipes ordered by ID.", envelope({ type: "array", items: ref("Recipe") })), ...errors(500),
    }) },
    "/api/recipes/{id}": { get: operation("getRecipe", "Get one recipe", "Recipes", {
      200: response("Recipe details.", envelope(ref("Recipe"))), ...errors(404, 500),
    }, { parameters: [{ name: "id", in: "path", required: true, schema: string("1"), description: "Existing recipes table primary key." }] }) },
    "/api/matches": { post: operation("createMatch", "Create a room and add its host", "Matches", {
      201: matchResponse, ...errors(400, 404, 500),
    }, { description: "Requires an existing profiles row. New rooms start in STORY mode with classroom selected. Initial credits follow the server storyConfig.",
      requestBody: body(object({ user_id: uuid, max_players: { type: "integer", minimum: 1, maximum: 4, default: 4 },
        map: { type: "string", default: "Kitchen_1", description: "Legacy map field; active map selection uses current_map." } }, ["user_id"])) }) },
    "/api/matches/{roomCode}": { parameters: [roomParameter], get: operation("getMatch", "Get room, players and host", "Matches", { 200: matchResponse, ...errors(404, 500) }) },
    "/api/matches/{roomCode}/join": { parameters: [roomParameter], post: operation("joinMatch", "Join a waiting room", "Matches", {
      200: response("Player already joined; data contains the match.", envelope(ref("Match"))),
      201: playerResponse, ...errors(400, 404, 500),
    }, { requestBody: body(object({ user_id: uuid }, ["user_id"])), description: "Room must be WAITING and have capacity (1-4 players)." }) },
    "/api/matches/{roomCode}/ready": { parameters: [roomParameter], patch: operation("setReady", "Update a player's ready flag", "Matches", {
      200: playerResponse, ...errors(400, 404, 500),
    }, { requestBody: body(object({ user_id: uuid, ready: { type: "boolean", example: true } }, ["user_id", "ready"])) }) },
    "/api/matches/{roomCode}/character": { parameters: [roomParameter], patch: operation("selectCharacter", "Select an owned character in the lobby", "Matches", {
      200: response("Character selected.", envelope(object({ characterId: string("pepper") }))), ...errors(400, 401, 403, 404, 409, 500, 503),
    }, { security: authenticated, requestBody: body(object({ characterId: {
      type: "string", example: "pepper", description: "pepper, mint, sage, phong, faker, ronaldo, trump, kha-banh, or an owned custom:USER_UUID character.",
    } }, ["characterId"])), description: "Authenticated active room members only. Room must be WAITING. Broadcasts character-selected." }) },
    "/api/matches/{roomCode}/start": { parameters: [roomParameter], post: operation("startMatch", "Start a ready lobby", "Matches", {
      200: matchResponse, ...errors(400, 403, 404, 500),
    }, { requestBody: body(object({ user_id: uuid }, ["user_id"])), description: "user_id must match host_id and all active players must be ready. FREE starts immediately; STORY enters map selection with an IDLE round." }) },
    "/api/matches/{roomCode}/mode": { parameters: [roomParameter], patch: operation("updateMode", "Change room mode and Free Play map", "Matches", {
      200: matchResponse, ...errors(400, 401, 403, 404, 409, 500),
    }, { security: authenticated, requestBody: body(object({ gameMode: { type: "string", enum: ["STORY", "FREE"], example: "FREE" }, mapId }, ["gameMode"])),
      description: "Authenticated host only, while WAITING. mapId is required for FREE; STORY resets current_map to classroom." }) },
    "/api/matches/{roomCode}/story/start": { parameters: [roomParameter], post: operation("startStoryRound", "Start an unlocked Story map", "Story", {
      200: matchResponse, ...errors(401, 403, 404, 409, 500),
    }, { security: authenticated, requestBody: body(object({ mapId: { type: "string", enum: mapIds.filter(id => id !== "kitchen"), example: "classroom" } }, ["mapId"])),
      description: "Authenticated host only. Requires a PLAYING STORY room without an active round and sufficient progress for this map. Server starts the map timer." }) },
    "/api/matches/{roomCode}/quit": { parameters: [roomParameter], post: operation("quitRound", "Return the group to map selection or lobby", "Matches", {
      200: response("Round stopped.", object({ data: object({ success: { type: "boolean", example: true } }) })), ...errors(401, 403, 500),
    }, { security: authenticated, requestBody: { ...body(object({ destination: { type: "string", enum: ["lobby"], description: "Omit for Story map selection; FREE always returns to the lobby." } })), required: false },
      description: "Any authenticated active room member can stop the round for the group. Returning to the lobby clears every active player's ready flag. A missing room currently produces 500." }) },
    "/api/custom-character": {
      get: operation("getCustomCharacter", "Get AI character, latest job and coin balance", "AI Characters", {
        200: response("Current character generation state.", object({ data: object({
          character: ref("CustomCharacter"), job: ref("GenerationJob"), price: { type: "integer", example: 500 },
          enabled: { type: "boolean" }, coins: { type: "integer" },
        }) })), ...errors(400, 401, 503),
      }, { security: authenticated, description: "Poll this endpoint after creation to see the latest job. Expired interrupted jobs are recovered/refunded." }),
      post: operation("generateCustomCharacter", "Start a paid full-body AI character job", "AI Characters", {
        202: response("Generation accepted; poll GET /api/custom-character for progress.", object({ data: object({ jobId: uuid }) })), ...errors(400, 401, 503),
      }, { security: authenticated, description: "Spends the configured coin price and starts asynchronous generation. Failures refund the reserved coins. JPEG/PNG/WebP image, maximum 5 MB decoded; JSON request limit is 7 MB. Head-only generation is unavailable.",
        requestBody: body(object({ image: { type: "string", description: "Raw base64-encoded JPEG/PNG/WebP bytes. Do not include a data:image/...;base64, prefix or a file path." },
          mode: { type: "string", enum: ["full-body"], default: "full-body" } }, ["image"])) }),
    },
  },
};
