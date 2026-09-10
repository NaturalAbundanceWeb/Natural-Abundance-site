# Order Notifications — Setup

When someone orders on the nursery page, three things fire:

1. **Netlify Forms** records the submission and emails Erik (no code, no API key)
2. **`nursery-checkout` function** emails Erik the full order *and* emails the customer a confirmation
3. **`nursery-checkout` function** decrements `data/inventory.json` in GitHub, which redeploys the site

Paths 1 and 2 are deliberately redundant. If the email API is down or unconfigured,
Netlify Forms still captures the order and notifies. Nothing is silently lost.

---

## Step 1 — Turn on Netlify Forms notifications (2 minutes, no account needed)

This alone guarantees Erik gets an email on every order.

1. Netlify → the site → **Forms**
2. The form is named **`nursery-order`** (it appears after the next deploy)
3. **Form notifications** → **Add notification** → **Email notification**
4. Send to `erik@naturalabundance.co` → Save

> Free tier allows 100 form submissions/month.

## Step 2 — Turn on the branded order + confirmation emails

These are the nicer emails: a full order breakdown for Erik (reply goes straight to
the customer) and a branded confirmation with a Venmo deposit button for the customer.

1. Create a free account at **resend.com** (3,000 emails/month free)
2. **Domains** → add `naturalabundance.co` → Resend shows 3 DNS records
3. Add those records in **Netlify → Domains → naturalabundance.co → DNS records**
   (Netlify runs the DNS, so this is the right place — not GoDaddy)
4. Wait for Resend to show the domain as **Verified**
5. **API Keys** → create one → copy it
6. Netlify → **Site configuration → Environment variables** → add:

| Key | Value |
|-----|-------|
| `RESEND_API_KEY` | the key from step 5 |

Until `RESEND_API_KEY` exists, the function skips the emails and logs a warning —
orders still work and Netlify Forms still notifies.

### Optional env vars

| Key | Default | Purpose |
|-----|---------|---------|
| `ORDER_NOTIFY_EMAIL` | `erik@naturalabundance.co` | where order alerts go |
| `ORDER_FROM_EMAIL` | `Natural Abundance <orders@naturalabundance.co>` | sender (must be on the verified domain) |

## Step 3 — Confirm inventory decrementing still works

The function needs `GITHUB_TOKEN` (a PAT with repo write scope) in Netlify env vars.
This was set up with the inventory system — worth confirming it's still there, since
without it orders come through fine but stock counts won't move.

---

## Checking on it later

- **Orders received:** Netlify → Forms → `nursery-order`
- **What the function did:** Netlify → Functions → `nursery-checkout` → logs.
  Each order logs one line with the email result and the inventory changes.
- **Email delivery:** Resend dashboard shows every send, bounce, and open.

## Delivery windows

Offered slots are generated in `nursery.html` (`buildWindows`): Saturday mornings
(8–11am) and Thursday afternoons (1–4pm), the next 8 openings, always at least 24
hours out. To change the days, hours, or how many are shown, edit the `SLOTS` array
there. Customers can also pick "Another time" and describe what they need in the
notes field.

## Delivery minimum

`DELIVERY_MINIMUM` in `nursery.html` (currently `200`). Delivery can't be selected
below it — the customer gets a message telling them exactly how much more they'd
need, and pointing them at the free Hilo Home Depot meet-up. Changing that one
constant updates the gate, the message, and the cart banner together.
