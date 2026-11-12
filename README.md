# GullyQuiz QR (Phase 1)

Zero-CapEx decentralized mobile trivia arenas powered by physical QR codes, hourly rotating PINs, and real-time WebSocket lobbies—turning rural micro-businesses (tea stalls, bookstores, and stationery shops) into ₹10 educational speed-quiz hubs.

---

## 🏗️ Architecture & Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS (Mobile-First UI).
- **Backend & Real-Time Engine:** Custom unified Node.js server (`server.ts`) integrating Next.js + `Socket.io` on the same port (`3000`) for low-latency WebSocket arena rooms.
- **Database & ORM:** PostgreSQL with Prisma ORM.
  - All currency calculations are stored as integer **paise** (`1000` paise = ₹10.00) to ensure zero floating-point arithmetic errors.
- **Zero-CapEx Revenue Split:**
  - **70%** to the Match Winner (Prize Pool)
  - **20%** to the Tea Stall / Bookstore Owner (Vendor Commission)
  - **10%** to Platform Infrastructure

---

## 📁 Project Structure

```
├── prisma/
│   ├── schema.prisma       # Database schema (Shop, Player, Question, Match, Participant, VendorPayout)
│   └── seed.ts             # Seeds 10 pilot shops (24h active PINs) + 30 curated GK questions
├── src/
│   ├── app/                # Next.js App Router (Mobile-First UI)
│   │   ├── api/            # Dynamic API endpoints (/api/shops, /api/questions, /api/matches)
│   │   ├── shop/[code]/    # QR code scan redirection route
│   │   ├── vendor/         # Physical counter display portal for stall owners
│   │   ├── layout.tsx      # Mobile viewport & layout config
│   │   └── page.tsx        # Real-time player speed-quiz arena & lobby
│   ├── lib/
│   │   ├── prisma.ts       # Singleton PrismaClient instance
│   │   └── types.ts        # Financial revenue splits & game state interfaces
│   └── server/             # Real-time Socket.io state machine
│       ├── events.ts       # Strongly typed client/server WebSocket packets
│       ├── gameState.ts    # Live arena state machine, 10s timer, score & payout engine
│       └── socket.ts       # Socket.io HTTP server binding
├── server.ts               # Custom Node.js server running Next.js + Socket.io on PORT 3000
├── tsconfig.json           # TypeScript configuration
├── tailwind.config.ts      # Tailwind CSS configuration
└── .env.example            # Environment variables template
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and configure your PostgreSQL database credentials:
```bash
cp .env.example .env
```

### 3. Generate Prisma Client & Push Schema
```bash
npx prisma generate
npx prisma db push
```

### 4. Seed 10 Pilot Shops & 30 Curated Questions
```bash
npm run prisma:seed
```

### 5. Launch the Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) on your mobile browser (or responsive dev tools) to join a speed arena or switch to the **Shop** tab for the counter display.

---

## 🏪 Pilot Shops Seeded (for local testing)

| Shop Code | Name | Owner | Counter PIN | Valid For |
|---|---|---|---|---|
| `SHP_001` | Sharma Chai Tapri & Snacks | Ramesh Sharma | `1234` | 24 Hours |
| `SHP_002` | Nandi Corner Tea & Filter Coffee | Venkatesh Gowda | `2468` | 24 Hours |
| `SHP_003` | Maa Saraswati Book Depot & Stationery | Pradeep Kumar Gupta | `1357` | 24 Hours |
| `SHP_004` | Gupta Ji Ki Mashhoor Special Chai | Anil Gupta | `4321` | 24 Hours |
| `SHP_005` | Kaveri Student Book House & Xerox | Suresh Shenoy | `9876` | 24 Hours |
| `SHP_006` | Al-Madina Chai Point & Bakery | Farhan Qureshi | `5555` | 24 Hours |
| `SHP_007` | Vidyarthi Pustak Bhandar | Kavitha Murthy | `7777` | 24 Hours |
| `SHP_008` | Sardarji Amrit Tulya Chaha | Gurpreet Singh | `8888` | 24 Hours |
| `SHP_009` | Pooja Newspaper & Magazine Corner | Pooja Verma | `1122` | 24 Hours |
| `SHP_010` | Annapurna Tea & Refreshment Centre | Mahesh Joshi | `3344` | 24 Hours |

---

## 🧪 Verification Commands

```bash
# Verify Prisma client generation:
npx prisma generate

# Verify TypeScript compilation:
npm run typecheck

# Verify Next.js production build:
npm run build
```
