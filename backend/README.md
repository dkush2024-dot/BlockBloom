# BlockBloom Backend

Production-quality backend service for the BlockBloom DAO governance platform.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your MongoDB URI, RPC URL, and contract addresses

# 3. Start MongoDB locally (if not using cloud)
mongod

# 4. Start the development server
npm run dev
```

The server starts at `http://localhost:5000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/daos` | List all DAOs |
| GET | `/api/daos/stats` | Aggregate DAO statistics |
| GET | `/api/daos/:address` | Get a single DAO |
| GET | `/api/proposals` | List proposals (filterable) |
| GET | `/api/proposals/:daoAddress/:proposalId` | Get a single proposal |
| POST | `/api/proposals/close-expired` | Close expired proposals |
| GET | `/api/votes` | List votes (filterable) |
| GET | `/api/votes/leaderboard` | Top voters leaderboard |
| GET | `/api/votes/voter/:address` | Voter history |

## WebSocket Events

Connect: `const socket = io('http://localhost:5000')`

| Emit | Listen | Description |
|------|--------|-------------|
| `join:dao` (address) | — | Subscribe to a DAO's updates |
| — | `dao:created` | New DAO deployed |
| — | `proposal:created` | New proposal created |
| — | `vote:cast` | New vote cast |

## Architecture

See `docs/ARCHITECTURE.md` for the full system design documentation.
