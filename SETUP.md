# Setup — what you need to do (manual steps)

I write the code; you run these in **your own** Supabase / GitHub / Vercel (not the Classter org).
You never need to share secrets with me — I build against the schema.

---

## 0. Prereqs
- Node 20.9+ (you have v24 ✅)
- Accounts: Supabase, GitHub, Vercel, API-Football

## 1. Create the Supabase project
1. supabase.com → **New project** (your personal org).
2. Name `fantasy-wc-2026`, pick a **region close to your friends** (e.g. `eu-west-2` London or `eu-central-1` Frankfurt), set + save a strong DB password.
3. Wait ~2 min for provisioning.

## 2. Run the database migration
1. Dashboard → **SQL Editor** → New query.
2. Paste the entire contents of [`web/supabase/migrations/0001_initial_schema.sql`](web/supabase/migrations/0001_initial_schema.sql) → **Run**.
3. Expect "Success". This creates all tables, RLS policies, the leaderboard function, and seed config.

## 3. Configure Auth
1. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback`
2. **Authentication → Providers → Email**: make sure Email is enabled (magic link).
3. *(Recommended)* Set up **custom SMTP** (Resend/Brevo/Gmail). The built-in email sender is rate-limited to a few per hour — risky when ~20 friends sign up at once.

## 4. Grab your API keys
**Project Settings → API**:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- anon / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- service_role key (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## 5. Get an API-Football key
- api-football.com → sign up → Dashboard → copy API key → `API_FOOTBALL_KEY`.
- Free tier is fine to start; upgrade to the ~€19/mo tier before kickoff for live-polling headroom.

## 6. Run locally
1. Copy `web/.env.example` → `web/.env.local` and fill every value.
   - `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
   - `INVITE_CODE=` a code you'll share with friends
   - `CRON_SECRET=` any long random string
2. From the project root: `npm run dev --prefix web`
3. Open http://localhost:3000 → you'll be redirected to **/login** → enter your email + invite code → click the magic link in your inbox → you're in. 🎉

## 7. Make yourself commissioner
After your first login, in the Supabase SQL Editor:
```sql
update profiles set is_commissioner = true
where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
```

## 8. Push to GitHub
From the project root:
```bash
git init
git add .
git commit -m "Fantasy WC: foundation (Next 16 + Supabase auth + schema)"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
(`.gitignore` already excludes `node_modules`, `.next`, and all `.env` files.)

## 9. Deploy on Vercel
1. vercel.com → **Add New → Project** → import the GitHub repo.
2. **Set Root Directory = `web`** (important — the app lives in a subfolder).
3. Add the same Environment Variables as `.env.local`, except:
   - `NEXT_PUBLIC_SITE_URL = https://<your-app>.vercel.app`
4. Deploy.
5. Back in Supabase → **Auth → URL Configuration**: set Site URL to your Vercel URL and add `https://<your-app>.vercel.app/auth/callback` to Redirect URLs.

---

## ✅ What's already built (this session)
- Next.js 16 app in `web/` (TypeScript, Tailwind), build verified green.
- Supabase wiring: browser client, server client, service-role admin client, session-refresh `proxy.ts`.
- Magic-link auth gated by the invite code (login page, callback, sign-out).
- Full Postgres schema + RLS + leaderboard function + seed settings.

## 🔜 What I build next (once your DB is live)
1. **Seed script** — pull 48 teams, 104 fixtures, and the player universe + prices from API-Football.
2. **Squad builder, predictions, bracket entry** — the pre-kickoff "must-lock" set.
3. **Scoring engine** (ported from `sim.py`) + **leaderboard**.
4. **Blocks / shields / re-draft** — before the first knockout round.

## 👉 Tell me when
Once steps **1–2** (project + migration) and **5** (API-Football key) are done, say so and confirm your **region** — I'll start the data seed + squad builder.
