# Big Two (Big 2) Multiplayer — MVP

A modern web app to play Big Two with 4 connected players. Minimal input: player name. A game auto-starts when 4 players are matched in a room.

Stack:
- Server: Node.js, Express, Socket.IO
- Client: React (Vite + TypeScript)
- Hosting: 
  - Frontend: Vercel (static site)
  - Backend: Render.com (or Railway/Fly.io for WebSocket support)

## Rules implemented
- 4 players, 13 cards each. First lead must include 3♦ (alone or in a valid combo).
- Rank order (high→low): 2 A K Q J 10 9 8 7 6 5 4 3
- Suit order (high→low): Spades > Hearts > Clubs > Diamonds
- Valid plays: single, pair, triple, and five-card hands ranked: straight < flush < full house < four-of-a-kind(+kicker) < straight flush
- Twos do NOT rank high in straights. In straights/straight flushes, 2 ranks below 3 and A can be high or low; A-2-3-4-5 is allowed as the lowest straight. Highest straight is A-K-Q-J-10.
- You must beat the previous play with the same number of cards (for 5-card hands, higher category beats lower). Passing is allowed except when you have the lead on a new trick.
- Trick ends when all other players pass consecutively. The last player to play leads the next trick.
- Match ends when a player runs out of cards. Each other player scores penalty points based on cards remaining:
  - 1–4 cards left: points = cards left
  - 5–9 cards left: points = cards left × 2
  - 10–13 cards left: points = cards left × 3
  The winner of the match (who finished their cards) gets 0 points for that match.
- A new match starts automatically; the match winner leads the next match (no 3♦ requirement after the first match).
- The overall game ends when any player's cumulative score exceeds 100. The lowest total score is the champion.

Note: Big Two has many variants. This MVP uses common rules aligned with Pagat/Wikipedia references.

## Deployment

**See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment instructions.**

This project uses a split deployment architecture:
- **Frontend**: Deployed on Vercel (optimized for React/Vite apps)
- **Backend**: Deployed on Render.com (supports WebSocket connections)

Quick start:
1. Deploy backend to Render (see DEPLOYMENT.md)
2. Copy your backend URL
3. Deploy frontend to Vercel with `VITE_BACKEND_URL` environment variable
4. Access your app at the Vercel URL

## Local development

- Prereqs: Node 18+

```
# From repo root
npm install
npm run dev   # runs server (http://localhost:5173 via Vite proxy) and client dev server

# Alternatively, build and run production
npm run build
npm start     # serves built client and websocket server on PORT (default 10000)
```

## Render deployment (Backend)

**Note**: For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

Create a new Web Service in Render and connect your Git repo.

- Build Command:
```
npm install && npm run build
```
- Start Command:
```
npm start
```
- Instance type: Free is fine for MVP (note free instance sleep limits)
- Ensure your app binds to `process.env.PORT` on `0.0.0.0` (default 10000) — already done in server.

The server serves the built client (`client/dist`) as static assets and hosts Socket.IO on the same origin.

### Deploy via Blueprint (render.yaml)

This repo includes a `render.yaml`. You can create the service from this blueprint:

1) Push this repository to GitHub/GitLab/Bitbucket.
2) In Render Dashboard: New → Blueprint → Select your repo.
3) Review and Create. It will provision a web service named `big2` with:
  - runtime: node (Free plan)
  - build: `npm install && npm run build`
  - start: `npm start`
  - health check: `/healthz`

Alternatively, you can create a standard Web Service (without Blueprint) and use the Build/Start commands above.

## Project structure

```
big2/
  client/           # Vite React TS app
  server/           # Express + Socket.IO + game engine
  package.json      # root scripts to build both client and server and start server
  README.md
  render.yaml       # Render blueprint for one-click deploy
  .gitignore        # Standard ignores
```

## Tests

Run the minimal engine test:
```
npm test
```

## Notes
- This is an MVP; network/disconnect edge cases are handled minimally. See TODOs in code for future hardening.
