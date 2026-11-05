# Kitchen Panic

A real-time, cooperative multiplayer cooking game in the spirit of _Overcooked_. Players share a kitchen, pick up ingredients, chop, grill and bake them, assemble plates, and serve customer orders before the timers run out.

- **Frontend:** React + Vite, Phaser 3 for the game scene, Socket.IO client
- **Backend:** Node.js, Express, Socket.IO (server-authoritative game logic)
- **Maps:** Tiled JSON files, served by the backend so client and server always use the same layout
- **Hosting:** frontend on Vercel, backend on Render

---

## Table of contents

1. [Gameplay](#gameplay)
2. [Controls](#controls)
3. [Project structure](#project-structure)
4. [Getting started](#getting-started)
5. [Environment variables](#environment-variables)
6. [How the game works](#how-the-game-works)
7. [Working with maps](#working-with-maps)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

## Gameplay

Customer orders appear on the order board (up to 3 at a time, a new one every 12 seconds). Each order has a countdown. Prepare the dish, put it on a plate and deliver it to the serving counter.

| Dish          | How to make it                                                                     |
| ------------- | ---------------------------------------------------------------------------------- |
| **Hamburger** | Bread + cooked meat (grill) + chopped tomato (cutting board) on a plate            |
| **Pizza**     | Dough + chopped tomato on a plate, then **bake the plate in the oven**, then serve |
| **Salad**     | Chopped salad (cutting board) on a plate                                           |

**Scoring:** `50 + seconds remaining on the order`. Serving faster scores higher. Expired orders disappear.

**Stations**

- **Ingredient shelves:** unlimited supply of each ingredient
- **Plate station:** take a clean plate
- **Cutting board:** chop tomato and salad (press `E` to start; moving away pauses the progress)
- **Grill:** cooks meat (raw → cooked → burnt if left too long)
- **Oven:** bakes a pizza plate (raw → cooked → burnt). Only a raw plate can be put in; baked or burnt plates cannot be put back
- **Serving counter:** hand in a finished plate
- **Trash bin:** throw away whatever you are holding
- **Order station:** view the current orders

---

## Controls

| Key               | Action                                           |
| ----------------- | ------------------------------------------------ |
| `W` `A` `S` `D`   | Move                                             |
| `E`               | Interact (take, place, chop, serve, view orders) |
| `Q`               | Drop the item you are holding                    |
| `Z` / mouse wheel | Toggle zoom (wide / close)                       |
| `Esc` or `E`      | Close the order board                            |

A hint above your character always shows what `E` will do right now.

**Plate shortcut:** while holding a (not yet baked) plate, standing next to an ingredient and pressing `E` adds it straight onto the plate. This works for items on the floor, finished items on a station (chopped tomato, cooked meat) and ingredient shelves, so you do not need to put the plate down first.

---

## Project structure

```
.
├── backend/
│   ├── package.json
│   └── src/
│       ├── app.js            # Express app, REST routes, map file route
│       ├── server.js         # HTTP + Socket.IO server, all game events
│       ├── classes/          # GameRoom, Item, Plate, Station, CookingStation,
│       │                     # CuttingStation, PizzaOvenStation, IngredientShelf
│       ├── maps/
│       │   ├── index.js      # map registry + layout cache
│       │   ├── readLayout.js # Tiled JSON -> layout (shelves, stations, spawn)
│       │   ├── bistro.json
│       │   └── kitchen.json
│       ├── routes/  controllers/  services/  middleware/  config/
│       └── ...
└── frontend/
    ├── package.json
    └── src/
        ├── main.jsx  App.jsx
        ├── pages/            # lobby, room and game pages
        ├── services/         # socket client, API helpers
        ├── lib/              # auth / backend client setup
        ├── assets/           # sprites (chefs, items)
        └── game/
            ├── KitchenScene.js      # Phaser scene: rendering, input, HUD
            ├── mapLoader.js         # Tiled map -> layout
            ├── stationBehaviors.js  # per-station client rules and labels
            └── maps/                # per-map config (bistro, kitchen)
```

---

## Getting started

### Prerequisites

- Node.js 18 or newer
- npm

### 1. Clone and install

```bash
git clone <your-repo-url>
cd <repo-folder>

cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment variables

Create `backend/.env` and `frontend/.env` (see [Environment variables](#environment-variables)).

### 3. Run the backend

```bash
cd backend
node src/server.js        # or the dev script defined in package.json
```

The API listens on `PORT` (default `5000`). Check `http://localhost:5000/` for the health message.

### 4. Run the frontend

```bash
cd frontend
npm run dev
```

Open the URL printed by Vite, sign in, create a room and start the game. Open a second browser window (another account) to test multiplayer.

---

## Environment variables

**Backend (`backend/.env`)**

| Variable   | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `PORT`     | Port to listen on (default `5000`)                         |
| _(others)_ | Any database or auth keys used by your services and routes |

**Frontend (`frontend/.env`)**

| Variable       | Description                                                                         |
| -------------- | ----------------------------------------------------------------------------------- |
| `VITE_API_URL` | Base URL of the backend, **without a trailing slash**, e.g. `http://localhost:5000` |
| _(others)_     | Auth provider URL and public key used by the frontend                               |

> Vite only exposes variables prefixed with `VITE_`. Restart the dev server after changing `.env`.

---

## How the game works

### Server-authoritative state

The server owns the truth. Each room is a `GameRoom` instance holding items, plates, stations, orders and score. Clients send intents (for example `take-ingredient`, `place-on-station`, `serve-order`) together with their position, and the server validates distance and ownership before changing anything, then broadcasts the result.

### Rooms

Rooms are identified by a room code. The first `join-room` event creates the `GameRoom` for that code, with the `mapId` supplied by the client. A room that was created with the wrong map and has not been played yet is recreated when a client joins with the correct `mapId`.

### Main socket events

| Client → server                         | Purpose                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `join-room`                             | Join a room (sends `roomCode`, `userId`, `mapId`)    |
| `player-position`                       | Stream the player position                           |
| `take-ingredient`, `take-plate`         | Take from a shelf / the plate station                |
| `pick-up-item`, `drop-item`             | Pick up or drop an item                              |
| `place-on-station`, `take-from-station` | Use grill, cutting board, oven                       |
| `start-cutting`                         | Start or resume chopping                             |
| `add-ingredient-to-plate`               | Add a held ingredient to a plate on the floor        |
| `add-to-held-plate`                     | Add a nearby ingredient to the plate you are holding |
| `request-orders`                        | Open the order board                                 |
| `serve-order`                           | Serve the plate you are holding                      |
| `use-trash-bin`                         | Throw the held item away                             |

| Server → client                                               | Purpose                                         |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `game-state`                                                  | Full snapshot of the room                       |
| `item-created`, `item-picked`, `item-dropped`, `item-removed` | Item changes                                    |
| `plate-picked`                                                | Plate contents changed                          |
| `station-updated`                                             | Station progress / contents changed             |
| `orders-updated`, `orders-list`                               | Order list changes / reply to `request-orders`  |
| `order-completed`                                             | An order was served (with points and new score) |
| `interaction-error`                                           | A readable error message shown as a toast       |
| `player-position`, `player-joined`, `player-left`             | Other players                                   |

### Interaction ranges

The client uses an interaction range of 20 world units. The server uses a slightly larger range for special stations and the added-to-plate actions to allow for rounding and latency. Keep the client range **less than or equal to** the server range.

---

## Working with maps

Maps are created in [Tiled](https://www.mapeditor.org/) and exported as JSON.

### Single source of truth

The map files live **only** in `backend/src/maps/`. The backend:

- reads them to build the room layout (`readLayout.js`), and
- serves them to the client at `GET /api/maps/:id`.

The frontend map config points to that URL:

```js
// frontend/src/game/maps/bistro/config.js
const mapUrl = `${import.meta.env.VITE_API_URL}/api/maps/bistro`;
```

Do **not** keep a second copy of the JSON in the frontend, otherwise the client and the server can disagree about where stations are.

### Object layer format

The `objects` layer contains the interactive objects:

| `type` (or `class`) | Required properties | Notes                                                                                                               |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `spawn`             | none                | Player spawn point                                                                                                  |
| `shelf`             | `id`, `ingredient`  | Ingredient shelf                                                                                                    |
| `station`           | `id`, `kind`        | `kind` is one of `plate-station`, `cutting-board`, `grill`, `oven`, `serving-counter`, `trash-bin`, `order-station` |

Optional properties on stations: `cookTime`, `burnTime`, `cutTime` (grill and cutting board), `bakeTime`, `burnTime` (oven). Times are in milliseconds.

> **Position note:** the station position is the center of the object rectangle. Avoid the custom properties `centerX` / `centerY`. If they exist they override the real position and will not follow the object when you move it in Tiled.

### Adding a new map

1. Add `yourmap.json` to `backend/src/maps/`.
2. Register it in `backend/src/maps/index.js`:
   ```js
   const MAP_FILES = {
     kitchen: "kitchen.json",
     bistro: "bistro.json",
     yourmap: "yourmap.json",
   };
   ```
3. Add `frontend/src/game/maps/yourmap/config.js` (tileset images, background, zoom) and register it in `frontend/src/game/maps/index.js`.
4. Pass `mapId: "yourmap"` when creating the scene.

---

## Deployment

Both apps are deployed from the same GitHub repository.

### Backend on Render

- **Type:** Web Service
- **Root Directory:** `backend`
- **Build Command:** `npm install`
- **Start Command:** the command used locally, for example `node src/server.js`
- **Environment:** the variables from `backend/.env`

After deploying, check `https://<your-service>.onrender.com/` and `https://<your-service>.onrender.com/api/maps/bistro`.

> Free Render services sleep when idle, so the first request after a while can take a few seconds. Game rooms live in server memory and are lost whenever the service restarts.

### Frontend on Vercel

- **Root Directory:** `frontend`
- **Framework preset:** Vite
- **Environment variables:** `VITE_API_URL=https://<your-service>.onrender.com` (no trailing slash)

Redeploy after changing environment variables, since Vite bakes them into the build.

### CORS

The backend must allow the Vercel domain for both REST (`cors`) and Socket.IO. The current setup allows all origins, which is convenient for development; restrict it to your frontend domain in production.

---

## Troubleshooting

| Symptom                                                                 | Likely cause and fix                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Too far from order station` / `serving counter` on a **new** room only | The server created the room with the wrong map or old station positions. Check the Render log line `Creating new GameRoom: <code> (map: ...)`, make sure every `join-room` sends `mapId`, and remove `centerX` / `centerY` from the map objects. Restart the server after changing map files |
| Player stuck in the top-left corner                                     | `spawn` was not found, usually because the map request failed or returned an error page. Open `/api/maps/<id>` and check it returns the JSON                                                                                                                                                 |
| `/api/maps/<id>` returns "Route not found"                              | The route is declared after the 404 handler in `app.js`. It must come before it                                                                                                                                                                                                              |
| Order board cannot be closed                                            | A leftover game instance from an earlier mount still listens to socket events. Make sure the React effect that creates `Phaser.Game` returns a cleanup that calls `game.destroy(true)` and removes socket listeners                                                                          |
| Server error toast: `Server error in <event>`                           | Look at the server log for `Error in "<event>"` and the stack trace                                                                                                                                                                                                                          |
| Items or plate cannot be placed on a station                            | The item class must implement `placeOnStation` and `takeFromStation` (both `Item` and `Plate` do)                                                                                                                                                                                            |

---

## License

Add your license here.
