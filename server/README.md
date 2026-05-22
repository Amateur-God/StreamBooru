# StreamBooru Sync Server

Account sync API for StreamBooru (favorites, site profiles, Discord OAuth, image proxy).

Runtime: **Bun** (v0.2.0+). Database: **PostgreSQL**.

## Coolify deployment

1. Create a new application in Coolify pointing at this repo.
2. Set **Base Directory** to `server`.
3. Nixpacks will pick up `nixpacks.toml` automatically (installs Bun, runs `bun install`, starts with migrations).
4. Add a PostgreSQL database (Coolify plugin or external) and set environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | Long random string for auth tokens |
| `ENC_SECRET` | yes | Long random string for encrypting stored site credentials |
| `BASE_URL` | yes | Public HTTPS URL, e.g. `https://streambooru.ecchibooru.uk` |
| `PORT` | no | Default `3000` (Coolify usually injects this) |
| `HOST` | no | Default `0.0.0.0` |
| `PGSSL` | no | Set `true` if Postgres requires SSL |
| `DISCORD_CLIENT_ID` | no | For Discord login/link |
| `DISCORD_CLIENT_SECRET` | no | For Discord login/link |

5. Deploy. On each start, `start:prod` runs SQL migrations then starts the API.

Health check path: `/health`

Discord OAuth redirect URI (if using Discord):  
`{BASE_URL}/auth/discord/callback`

## Local development

```bash
cd server
cp .env.example .env   # edit DATABASE_URL and secrets
bun install
bun run migrate
bun run start
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run start` | Start API only |
| `bun run migrate` | Apply pending SQL migrations |
| `bun run start:prod` | Migrate then start (used by Coolify) |
