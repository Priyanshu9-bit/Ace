# Ace

A real-time multiplayer web application with WebRTC voice chat and Socket.IO live synchronization.
Built with React + Vite on the frontend and Node.js + Express on the backend.

```bash
npm install
npm start          # builds the client on first run, then serves on http://localhost:3001
```

## Features

- **Real-Time Rooms**: Room creation, short joining codes, and live multi-user synchronization via Socket.IO.
- **Built-in Voice Chat**: Peer-to-peer WebRTC mesh voice communication with live mic status and speaking activity detection.
- **Responsive Interface**: Glassmorphism UI, desktop & mobile optimized, customizable themes, and smooth animations.
- **Server-Authoritative**: Complete room state management, validation, and session recovery handled on the backend.
- **Internationalization**: Dual language support (English and Odia).

## Requirements

* Node.js **20.19+** (Node 22 recommended) and npm 10+.

## Running Locally

### Production Mode

```bash
npm install
npm start
# -> http://localhost:3001
```

### Development Mode

```bash
npm install
npm run dev
# client: http://localhost:5173
# server: http://localhost:3001
```

## Tests

```bash
npm test
```

Includes 49 automated unit, integration, and multiplayer simulation tests.

## Configuration (Environment Variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `CLIENT_ORIGIN` | *(empty)* | Allowed browser origins if client is on a different domain |
| `MAX_PLAYERS` | `13` | Maximum players per room |
| `SERVE_CLIENT` | `true` | Serve client build from the Node server |

## Architecture

- `client/`: React + Vite frontend application, sound synthesizer, and WebRTC engine.
- `server/`: Express + Socket.IO real-time backend engine.
- `scripts/`: Auto-build and startup orchestration.
