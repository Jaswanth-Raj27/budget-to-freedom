# Debt Free Buddy

<<<<<<< ours
Debt Free Buddy helps people turn credit-card debt into a clear, manageable payoff plan. Compare payoff strategies, save plans for different scenarios, and track real repayments alongside the original simulation.

> Debt Free Buddy does not connect to bank accounts or collect card numbers. Plans use the balances, interest rates, and budgets that you enter.

## What it does

- **Explore payoff plans:** Add debts and a monthly budget, then simulate Snowball or Avalanche repayment strategies.
- **Compare outcomes:** Review projected payoff timelines, interest costs, monthly balances, and strategy comparisons.
- **Save scenarios:** Keep multiple plans in your account and edit them later. Saved-card library items are copied into a scenario, so editing a library card does not change existing plans.
- **Track actual repayments:** Record dated payments against a card in a specific scenario. Starting balances stay unchanged; remaining balances use the original balance minus recorded payments.
- **See progress:** View total repaid, remaining debt, repayment percentage, monthly totals, streaks, and derived achievement badges.
- **Protect history:** Payment requests use a database RPC, scenario/card ownership checks, and idempotent retries. Scenario edits preserve existing card IDs; removing a card with payment history is blocked rather than silently deleting that history.

## Technology

- React, TypeScript, and TanStack Start
- Vite, Tailwind CSS, and shared UI components built with Radix UI
- Supabase Auth and PostgreSQL with row-level security
- Recharts for payoff visualizations and Motion for interface animation
- PostgreSQL SQL migrations with Drizzle migration metadata

## Run locally

### Requirements

- Node.js and npm
- A Supabase project for authentication and persisted user data

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

Configure the Supabase project variables in an ignored local environment file such as `.env.local`:

```text
VITE_SUPABASE_URL=<your Supabase project URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<your Supabase publishable key>
```

Use a publishable client key only. Never put a service-role key or database password in browser-facing variables or commit credentials. The application does not apply database migrations when it starts.

## Available commands

```sh
npm run dev                 # Start the local development server
npm run build               # Build the production bundle
npm run preview             # Preview the built app locally
npm run test:repayment      # Run repayment calculation and retry tests
npm run lint                # Run ESLint across the repository
npm run format              # Format files with Prettier
npx tsc --noEmit            # Check TypeScript types
```

## Database and migration status

The repayment feature requires the database tables and RPCs defined in migrations 0003–0007. The Drizzle journal currently records the verified base migrations through 0002; later migrations are not recorded there. Migrations 0004 and 0005 in this repository are newly authored replacement drafts, not recovered copies of the earlier reviewed files. The current 0004/0005 drafts have **not** been validated against PostgreSQL.

Before applying database changes, review:

- [`docs/lovable-cloud-migration-runbook.md`](docs/lovable-cloud-migration-runbook.md)
- [`docs/migration-reconciliation-plan.md`](docs/migration-reconciliation-plan.md)
- [`docs/repayment-migration-security-review.md`](docs/repayment-migration-security-review.md)

Confirm the target database's migration history and the supported migration workflow first. Test the exact migration files, in order, against a disposable PostgreSQL/Supabase-compatible database. Application builds and unit tests do not verify SQL execution, RLS behavior, privileges, or concurrency.

## Security notes

- Authentication and user-owned data rely on Supabase Auth and database RLS.
- Real payment records are scoped to a user and scenario; simulated future payments are not recorded as actual repayments.
- Achievement badges are derived from actual recorded payments and are not represented as persisted achievements by the UI.
- Do not use a production or personal database for local migration tests. Use synthetic data in a disposable environment.

## Project

Debt Free Buddy is developed locally and in [Lovable](https://lovable.dev). The repository is the source for the application and its migration documentation.
=======
Build a web app called "Debt Free Buddy" — a credit card payoff simulator 
with user accounts, using Supabase for authentication and data storage 
(use Lovable's native Supabase integration).

AUTHENTICATION
- Email + password signup and login, using Supabase Auth.
- On signup, ask for: full name, email, password. Create a "profiles" 
  table (id references auth.users, name, email, created_at) with a 
  trigger that auto-creates a profile row on signup.
- Include "forgot password" and a simple account settings page (update 
  name, change password, delete account).
- Protect all app pages behind login — signed-out users see only a 
  landing page with a "Get started" button leading to signup.

DATA MODEL (Supabase tables, with Row Level Security so each user only 
ever sees their own rows)
- "scenarios": id, user_id, name, budget, budget_mode, strategy, 
  created_at
- "cards": id, scenario_id, user_id, name, balance, apr, min_pct, 
  min_floor
Every table must have RLS policies restricting select/insert/update/
delete to rows where user_id = auth.uid().

USER-FRIENDLY UI/UX (this matters more than visual style)
- Onboarding is step-by-step, not one long form: Step 1 "Add your 
  cards" (one card at a time, clearly labeled fields — not placeholder-
  only — with a "+ Add another card" action and a delete button on each 
  card already added), Step 2 "Set your budget and strategy" (budget 
  input, Snowball vs Avalanche toggle with a one-line plain-English 
  explanation of each), Step 3 "Review results". Show a small step 
  indicator (Step 1 of 3) throughout.
- Pre-fill sensible defaults: min_pct 2%, min_floor $25, so users touch 
  as few fields as possible.
- Show a live-updating "Total debt: $X across N cards" summary as the 
  user adds cards, before they even run the simulation.
- After signup, returning users land on a dashboard listing their saved 
  scenarios (name, last edited, quick "debt-free in X months" preview) 
  with a clear "+ New scenario" button — not straight into a blank form.
- Use inline confirmation (toast or small animation) when a card or 
  scenario is added, saved, or deleted — never a silent action.
- Results page: headline stat cards (months to debt-free, interest 
  saved vs. minimums-only, total paid), a line chart (Recharts) 
  comparing balance-over-time for the chosen strategy vs. minimums-only, 
  a collapsible month-by-month table, and a "Save this scenario" button 
  so it appears on their dashboard next time they log in.
- Every scenario a user saves must load back exactly as they left it 
  when they return.

VISUAL STYLE
Professional, minimal fintech look: navy (#16233f) and muted gold 
(#d9a04b) accents, off-white background, Inter font, rounded-but-
restrained corners (10-16px), subtle shadows, no mascot or cartoon 
elements. Calm, confident, trustworthy — this handles someone's real 
debt numbers.

SIMULATION LOGIC (client-side, one clean commented function)
Each month: accrue interest (balance × APR / 12), pay every card's 
minimum (max(balance × min_pct, min_floor), capped at remaining 
balance), then send leftover budget to the target card by strategy 
(Snowball = smallest balance first, Avalanche = highest APR first), 
cascading extra payment to the next target if one clears mid-month. 
Support fixed_total and fixed_extra budget modes. Stop at zero balance, 
or flag "this budget will never pay off your debt" if a full month 
passes with no reduction. Round to the cent, never let balance go 
negative. Handle: single card, budget below total minimums (show a 
warning, don't crash), 0% APR, balance under the floor minimum, final 
payment landing exactly at zero.

TECH
React + Tailwind + Supabase (auth + Postgres). Recharts for charts. 
Mobile-responsive throughout. Deploy using Lovable's built-in publish/
deploy feature once working.

No real bank account linking, no card numbers collected anywhere — 
users only enter balances and APRs for simulation purposes. Make that 
reassurance visible somewhere on the landing/signup page (e.g. "We 
never ask for your card number — just your balances and rates").

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://budget-to-freedom.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/acf39fdc-2c65-4a90-a261-ce2b7194c3a3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
>>>>>>> theirs
