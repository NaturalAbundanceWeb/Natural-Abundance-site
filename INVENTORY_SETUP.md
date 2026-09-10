# Nursery Inventory System — One-Time Setup

This document is the only time you'll ever touch GitHub or Netlify credentials.
After setup, tell Dispatch "sold 3 soursop" and the live site updates automatically.

---

## How the System Works

```
Erik tells Dispatch → Dispatch calls Netlify Function
                     → Function commits to GitHub API
                     → GitHub webhook fires
                     → Netlify rebuilds
                     → naturalabundance.co shows updated inventory
```

Customer orders do the same thing automatically when they submit the checkout form.

---

## Step 1 — Create a GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name it: `natural-abundance-inventory`
4. Expiration: **No expiration** (or 1 year and set a calendar reminder)
5. Check only: **`repo`** (full control of private repositories)
6. Click **Generate token**
7. Copy the token — you won't see it again

---

## Step 2 — Choose a Dispatch Secret

Pick any password you like. Something simple is fine since it never leaves your computer.

Example: `na-nursery-2026`

---

## Step 3 — Add Environment Variables to Netlify

1. Go to https://app.netlify.com → your site → **Site configuration** → **Environment variables**
2. Add these four variables:

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | The token from Step 1 |
| `GITHUB_REPO` | `NaturalAbundanceWeb/Natural-Abundance-site` |
| `GITHUB_BRANCH` | `main` |
| `DISPATCH_SECRET` | The secret you chose in Step 2 |

3. Click **Save**

---

## Step 4 — Create Your Local Config File

In the `website/natural-abundance-site/` folder, copy `.inventory-config.json.example` to `.inventory-config.json` and fill it in:

```json
{
  "functionUrl": "https://naturalabundance.co/.netlify/functions/update-inventory",
  "dispatchSecret": "na-nursery-2026"
}
```

This file is gitignored — it never gets pushed to GitHub.

---

## Step 5 — Push This Commit

Double-click `push-site.command` to push all these new files to GitHub.
Netlify will rebuild with the new functions deployed.

**Verify it worked:** After the build finishes (~60 seconds), go to
`https://naturalabundance.co/data/inventory.json` — if you see the JSON, the data layer is live.

---

## That's it. You're done.

From now on:
- Tell Dispatch: `sold 3 soursop`
- Tell Dispatch: `added 10 starfruit at $25`
- Tell Dispatch: `set ackee to 20`
- Customers submit checkout → inventory auto-decrements

No git. No terminal. No manual steps.

---

## Troubleshooting

**Inventory not updating after Dispatch?**
→ Check Netlify dashboard → Functions → `update-inventory` → logs

**Customer orders not decrementing?**
→ Check Netlify dashboard → Functions → `nursery-checkout` → logs

**GitHub token expired?**
→ Repeat Step 1, update the Netlify env var

**Need to manually edit inventory?**
→ Edit `data/inventory.json` directly, then push with `push-site.command`
→ Or just tell Dispatch "set soursop to 14"
