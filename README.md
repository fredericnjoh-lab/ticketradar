# TicketRadar

Real-time ticket resale intelligence platform. Scans SeatGeek, Ticketmaster, and custom Google Sheets to detect high-margin resale opportunities, track presales, and manage a ticket portfolio — all from a single dashboard.

---

## Tech Stack

| Layer    | Technology                                      |
|----------|--------------------------------------------------|
| Frontend | Vanilla JS, Chart.js, Leaflet.js, PWA            |
| Backend  | Node.js, Express, Axios                           |
| Database | Supabase (PostgreSQL + Auth)                      |
| AI       | Anthropic Claude API                              |
| Alerts   | Telegram Bot API (server-side only)               |
| Hosting  | GitHub Pages (frontend) + Render (backend)        |

---

## Features

**Market Intelligence**
- Multi-source event scanning (SeatGeek, Ticketmaster, Google Sheets)
- Automatic margin calculation (face value vs. resale, net of 15% fees)
- Composite scoring (1-10) based on margin and historical performance
- Price drop detection (alerts on >=5% decreases)
- Live EUR/USD/GBP exchange rates

**Presale & Countdown**
- Presale date tracker with codes and sources
- Automated J-7 / J-3 / J-1 countdown alerts via Telegram
- Browser push notifications for upcoming presales

**Portfolio Management**
- Kanban board: Watch -> Bought -> Selling -> Sold
- Real-time P&L: latent profit, realized gains, total valuation
- Custom event entry with quantity and notes
- ROI calculator with FX conversion and commission models

**Analytics**
- Price history charts (daily snapshots via Supabase)
- Side-by-side event comparison
- Geographic heatmap of event prices
- AI-powered market analysis and sell-timing recommendations

**Notifications**
- Telegram: top-5 margin alerts, price drops, presale reminders, countdowns
- All notifications routed through the backend (no token in frontend)

**Multi-User**
- Supabase email/password auth
- Per-user settings, watchlist, kanban, and price history synced to cloud

---

## 1-Click Deploy

### Prerequisites

- A [Supabase](https://supabase.com) project (free tier works)
- A [Render](https://render.com) account (free tier works)
- A [Telegram Bot](https://core.telegram.org/bots#botfather) token and chat ID
- API keys: [SeatGeek](https://seatgeek.com/account/develop), [Ticketmaster](https://developer.ticketmaster.com), [Anthropic](https://console.anthropic.com)

### 1. Deploy the Backend on Render

1. Push this repo to GitHub (or fork it).
2. On [Render](https://dashboard.render.com), create a **New Web Service**.
3. Connect your GitHub repo, set:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
4. Add all environment variables from `.env.example` (see below).
5. Deploy. Note the service URL (e.g. `https://ticketradar-backend.onrender.com`).

### 2. Deploy the Frontend on GitHub Pages

1. In your repo settings, go to **Pages** > Source: **GitHub Actions**.
2. The workflow at `.github/workflows/deploy-pages.yml` deploys on every push to `main`.
3. Your frontend is live at `https://<username>.github.io/ticketradar/`.

### 3. Set Up Supabase

1. Create a new Supabase project.
2. Create the following tables:

   - **profiles** — `id (uuid, PK)`, `email`, `seuil`, `lang`, `theme`, `sheet_url`, `tg_chat_id`, `created_at`
   - **watchlist** — `id (uuid, PK)`, `user_id (FK)`, `event_name`, `data (jsonb)`, `created_at`
   - **kanban** — `id (uuid, PK)`, `user_id (FK)`, `event_name`, `column`, `data (jsonb)`, `created_at`
   - **price_history** — `id (uuid, PK)`, `event_name`, `price`, `source`, `date`, `created_at`
   - **custom_events** — `id (uuid, PK)`, `user_id (FK)`, `data (jsonb)`, `created_at`

3. Copy your project URL and anon key into `supabase.js`.

### 4. Configure the Frontend

Open the app in your browser, go to **Settings**, and enter:
- Your backend URL
- Your Google Sheet CSV URL (optional)
- Your Telegram chat ID
- Preferred language and alert threshold

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable                 | Required | Description                                 |
|--------------------------|----------|---------------------------------------------|
| `TELEGRAM_TOKEN`         | Yes      | Telegram Bot API token from BotFather       |
| `TELEGRAM_CHAT_ID`       | Yes      | Default Telegram chat ID for alerts         |
| `SEATGEEK_CLIENT_ID`     | Yes      | SeatGeek API client ID                      |
| `SEATGEEK_CLIENT_SECRET` | Yes      | SeatGeek API client secret                  |
| `TICKETMASTER_API_KEY`   | Yes      | Ticketmaster Discovery API key              |
| `ANTHROPIC_API_KEY`      | No       | Anthropic API key (enables AI features)     |
| `STRIPE_SECRET_KEY`      | No       | Stripe secret key (enables payments)        |
| `STRIPE_WEBHOOK_SECRET`  | No       | Stripe webhook signing secret               |
| `STRIPE_PRO_PRICE_ID`    | No       | Stripe Price ID for the Pro subscription    |
| `SUPABASE_URL`           | No       | Supabase project URL (for Stripe webhook)   |
| `SUPABASE_SERVICE_KEY`   | No       | Supabase service role key (for plan updates)|
| `SHEET_URL`              | No       | Google Sheet CSV export URL for custom data |
| `ALLOWED_ORIGIN`         | Yes      | Frontend origin for CORS                    |
| `BACKEND_URL`            | No       | Public backend URL (used by Telegram webhook) |
| `DEFAULT_SEUIL`          | No       | Default margin threshold % (default: 30)    |
| `PORT`                   | No       | Server port (default: 3000, set by Render)  |

---

## API Endpoints

### Health

| Method | Path           | Description           |
|--------|----------------|-----------------------|
| GET    | `/`            | Lists all endpoints   |
| GET    | `/api/health`  | Service health check  |

### Scanning

| Method | Path             | Description                                  |
|--------|------------------|----------------------------------------------|
| GET    | `/api/scan`      | Full scan — query params: `q`, `seuil`, `limit`, `source` (seatgeek/ticketmaster/all), `sheet` |
| GET    | `/api/scan/top`  | Top 10 opportunities above threshold         |
| GET    | `/api/prices`    | Reference prices for major events            |

### Notifications

| Method | Path                  | Description                              |
|--------|-----------------------|------------------------------------------|
| POST   | `/api/notify`         | Send margin & drop alerts via Telegram   |
| GET    | `/api/test`           | Send a test Telegram message             |
| POST   | `/api/countdown`      | Send J-7/J-3/J-1 countdown alerts       |
| GET    | `/api/countdown/check`| Auto-check & alert upcoming events       |

### Telegram Webhook

| Method | Path              | Description                          |
|--------|-------------------|--------------------------------------|
| POST   | `/webhook`        | Receives Telegram bot commands       |
| GET    | `/webhook/setup`  | Registers webhook URL with Telegram  |

### AI

| Method | Path       | Description                                  |
|--------|------------|----------------------------------------------|
| POST   | `/api/ai`  | Claude-powered market analysis (body: `{ question, context }`) |

### Payments (Stripe)

| Method | Path                    | Description                                          |
|--------|-------------------------|------------------------------------------------------|
| GET    | `/api/plans`            | Returns Free and Pro plan details                    |
| POST   | `/api/create-checkout`  | Creates a Stripe checkout session (body: `{ email, userId }`) |
| POST   | `/api/webhook/stripe`   | Stripe webhook — updates user plan on payment success |

---

## Project Structure

```
ticketradar/
├── index.html          — Single-page app entry point
├── app.js              — Core frontend logic
├── config.js           — Platform definitions, markets, fallback data
├── components.js       — Reusable UI components
├── supabase.js         — Database & auth client
├── styles.v6.css       — Design system (dark theme)
├── server.js           — Express backend
├── package.json        — Node.js dependencies
├── sw.js               — Service Worker (offline/PWA)
├── manifest.json       — PWA manifest
├── .env.example        — Environment variable template
└── .github/workflows/
    └── deploy-pages.yml — GitHub Pages CI/CD
```

---

## License

Private project.
