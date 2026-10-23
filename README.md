# Thrive Gym API

Cloud API for Thrive Gym. The desktop app syncs its data here; the website
(`thrive-front`) reads it for the admin panel and the public pages.

NestJS + TypeORM on Postgres. The schema is created and kept in step by TypeORM on start.

## Setup

```bash
npm install
cp .env.example .env   # fill it in; every setting is described there
npm run start:dev      # http://localhost:<PORT>, Swagger at /api/docs
```

On first start with an empty database, the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
is created. To change the login later:

```bash
npm run update:admin -- admin@example.com 'a-long-password'
```

## Connecting the desktop app

In the desktop app's sync settings, set the API URL to this API's public URL and the
API key to the same value as `API_KEY_SECRET`.

## Public website data

`GET /api/site/catalog` (no auth) returns the active membership plans, add-ons with
their variants, and the main weekly class timetable. The website's services and home
pages render from it, so prices and classes are edited in the desktop app, not in code.

## Deploy

Pushing to `master` runs `.github/workflows/main.yml`, which pulls, builds and
(re)starts the `thrive-gym-api` PM2 process on the VPS. Repository secrets needed:
`HOST`, `USERNAME`, `PRIVATE_KEY`, `SSH_PORT`. The `.env` lives on the server in
`~/apps/thrive-gym-api/.env`.

## Scripts

| Command | |
| --- | --- |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled app |
| `npm test` | Unit tests |
| `npm run update:admin` | Set the admin email and password |
| `npm run clear:db` | Delete all synced data (careful) |
