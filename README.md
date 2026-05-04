# Word Vault Website (Cloudflare D1)

A ready-to-deploy Node.js website connected to your Cloudflare D1 database.

## 1) Install

```bash
npm install
```

## 2) Configure environment

Copy `.env.example` to `.env` and fill values:

```env
CF_ACCOUNT_ID=9dcb8ec788475639d245660cfb8eb9a4
CF_D1_DATABASE_ID=97df4dfc-649d-475e-b52f-875e85b48e44
CF_API_TOKEN=your_rotated_token_here
PORT=3000
```

Important: rotate the previously exposed token in Cloudflare and use the new one.

## 3) Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## API routes

- `GET /api/words` - list all words
- `POST /api/words` - create `{ word, definition }`
- `PATCH /api/words/:id` - update `{ word, definition }`
- `DELETE /api/words/:id` - delete row

## Deploy (quick path)

Deploy to Render, Railway, Fly.io, or any Node host:

1. Push this folder to GitHub.
2. Create a new Web Service from the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables from `.env` in the host dashboard.

The app auto-creates the `words` table at startup if it does not exist.
