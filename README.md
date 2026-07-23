# Krishna's Aura — Firecracker Storefront

A single-login, role-based e-commerce portal for firecracker sales — **100% free tier, no billing required.**

- **One "Login" button.** Two ways in:
  - **Continue with Google** — one click, no page redirect, so an in-progress cart is never at risk.
  - **Continue with email** — for anyone without/not using Google. Known emails get a sign-in link immediately; new emails first see a short **"create account"** step (full name, phone), then get the link.
- `krishnasaaura@gmail.com` is the pre-registered **Superadmin/seller** — signing in with that email (via either method) always lands on the seller dashboard. Enforced server-side in `firestore.rules`, not just in the UI.
- Cart is backed up to `localStorage` so it survives an email link opening in a fresh tab.

**Stack**: React (Vite) · Firebase Authentication (Google provider + email-link passwordless) · Firestore · deployable on Vercel free tier. No Cloud Functions, no paid Blaze plan needed.

The app runs in **demo mode** out of the box (no Firebase needed): simulated sign-in and a built-in ~140-item catalog.

---

## 1. Run locally (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:5173 — a "Demo mode" banner shows until Firebase is configured.

## 2. Firebase project setup

1. https://console.firebase.google.com → your project (or create one). **Stay on the free Spark plan** — nothing here needs Blaze.
2. **Add a Web app** (Project settings → General → Your apps → `</>`). Copy the six config values.
3. Copy `.env.example` to `.env.local` and paste the values in (skip `measurementId` — not used).
4. **Enable Authentication providers**: Build → Authentication → Sign-in method:
   - **Google** → enable it, pick a support email.
   - **Email/Password** → enable it, then also toggle on **"Email link (passwordless sign-in)"** underneath.
5. **Authorized domains** (Authentication → Settings → Authorized domains): confirm `localhost` is listed; add your Vercel domain later (step 6).
6. **Create Firestore**: Build → Firestore Database → Create database → production mode.
7. **Deploy security rules**: paste `firestore.rules` into Firestore → Rules → Publish.
   These rules check the signed-in user's *verified* email against `krishnasaaura@gmail.com` — so only that account can ever hold the seller role or write products, regardless of what the browser sends.
8. **Enable Storage** (for seller product photo uploads): Build → Storage → Get started → production mode → Done.
9. **Deploy Storage rules**: paste `storage.rules` into Storage → Rules → Publish. Only the seller account can upload; anyone can view (needed since photos show in the public storefront).

## 3. Restart and test

```bash
npm run dev
```

Reload the browser. Click **Login**:
- Try **Continue with Google** with any Google account.
- Try **Continue with email** with a new address — you should see the "Create your account" step, then a "check your email" screen. Click the emailed link (same browser) to finish signing in.
- Sign in with `krishnasaaura@gmail.com` (either method) — you should land on the seller dashboard.

## 4. Seed the product catalog

Sign in as the seller and click **"Seed full catalog"** on the dashboard — this copies the built-in ~140-item catalog into Firestore, after which it's live and editable.

## 5. GitHub + Vercel deployment

```bash
git init
git add .
git commit -m "Krishna's Aura storefront"
git remote add origin https://github.com/<your-username>/krishnas-aura.git
git push -u origin main
```

1. https://vercel.com → **Add New Project** → import the repo (Vite auto-detected).
2. **Project Settings → Environment Variables** → add the six `VITE_FIREBASE_*` values.
3. Deploy → free `*.vercel.app` URL.
4. Add that domain to Firebase **Authorized domains** (Authentication → Settings).
5. **Custom domain later**: Vercel → Domains → add your GoDaddy domain → follow the DNS instructions (A/CNAME record in GoDaddy). Add that domain to Firebase Authorized domains too.

## 6. Project structure

```
src/
  App.jsx               UI: storefront, single-login auth modal, cart, seller dashboard
  App.css                Festive dark theme
  lib/
    firebase.js           Firebase init (env-driven; demo mode if unset)
    authService.js         Google sign-in + email-link sign-in, cart backup, roles
    productService.js      Firestore products + per-user carts (live sync)
    catalog.js              Categories + seed catalog (~140 items)
firestore.rules          Server-side role enforcement (checked by verified email)
.env.example              Firebase config template
```

## Compliance note

Fireworks are a regulated product in India (explosives licensing, PESO rules, state-specific restrictions on online sale/delivery). Confirm with a legal advisor what your site may do — catalog display and booking-for-pickup are typically treated very differently from online payment and shipping.

## Roadmap

- [ ] Checkout: orders collection + order status dashboard for seller
- [ ] Payment (UPI deep link / Razorpay)
- [ ] Photo upload via Firebase Storage
- [ ] Order confirmation emails
- [ ] Typed 6-digit OTP as an alternative to the email link (requires upgrading to Blaze + Cloud Functions + an email API like Resend) — noted as a possible future upgrade, not required for launch
