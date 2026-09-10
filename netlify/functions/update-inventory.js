// update-inventory.js
// Called by the Dispatch skill (via Claude/Cowork) when Erik says things like:
//   "sold 3 soursop"
//   "added 10 starfruit at $25"
//   "set ackee to 12"
//   "price change: cacao is now $18"
//
// Authenticates with DISPATCH_SECRET to reject outside calls.
// Updates inventory.json in GitHub → triggers Netlify rebuild → live site updates.
//
// Required Netlify env vars:
//   GITHUB_TOKEN     — Personal Access Token with repo write scope
//   GITHUB_REPO      — "NaturalAbundanceWeb/Natural-Abundance-site"
//   GITHUB_BRANCH    — "main" (default)
//   DISPATCH_SECRET  — A password you choose; stored in .inventory-config.json for Claude

'use strict';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Auth check
  const dispatchSecret = process.env.DISPATCH_SECRET;
  if (!dispatchSecret || body.secret !== dispatchSecret) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { updates } = body;
  // updates: array of { name, action, qty?, price? }
  // action: "sold" | "added" | "set" | "price"
  if (!Array.isArray(updates) || updates.length === 0) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No updates provided' }) };
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'NaturalAbundanceWeb/Natural-Abundance-site';
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }) };
    }

    // Fetch current inventory
    const fileData = await githubGet(token, repo, branch);
    const inventory = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    const changes = [];
    const newPlants = [];

    for (const update of updates) {
      const nameLower = (update.name || '').toLowerCase().trim();
      const plant = inventory.find(p => p.name.toLowerCase() === nameLower);

      switch (update.action) {
        case 'sold':
          if (plant) {
            const before = plant.available;
            plant.available = Math.max(0, plant.available - (update.qty || 1));
            changes.push(`${plant.name}: sold ${update.qty || 1} (${before} → ${plant.available})`);
          } else {
            changes.push(`WARNING: "${update.name}" not found in inventory`);
          }
          break;

        case 'added':
          if (plant) {
            const before = plant.available;
            plant.available += (update.qty || 1);
            if (update.price !== undefined) plant.price = update.price;
            changes.push(`${plant.name}: added ${update.qty || 1} (${before} → ${plant.available})${update.price ? `, price now $${update.price}` : ''}`);
          } else {
            // New plant — add it
            const newPlant = {
              name: update.name,
              botanical: update.botanical || '',
              category: update.category || 'fruit-trees',
              price: update.price || 0,
              available: update.qty || 1,
              image: update.image || '',
              description: update.description || '',
              featured: false,
            };
            inventory.push(newPlant);
            newPlants.push(newPlant.name);
            changes.push(`NEW: added ${newPlant.name} (qty: ${newPlant.available}, $${newPlant.price})`);
          }
          break;

        case 'set':
          if (plant) {
            const before = plant.available;
            plant.available = update.qty;
            changes.push(`${plant.name}: set to ${update.qty} (was ${before})`);
          } else {
            changes.push(`WARNING: "${update.name}" not found`);
          }
          break;

        case 'price':
          if (plant) {
            const before = plant.price;
            plant.price = update.price;
            changes.push(`${plant.name}: price $${before} → $${update.price}`);
          } else {
            changes.push(`WARNING: "${update.name}" not found`);
          }
          break;

        default:
          changes.push(`WARNING: unknown action "${update.action}" for "${update.name}"`);
      }
    }

    const commitMsg = `Inventory update: ${changes.filter(c => !c.startsWith('WARNING')).join(', ')} [Dispatch]`;
    await githubPut(token, repo, branch, inventory, fileData.sha, commitMsg);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, changes, newPlants }),
    };

  } catch (err) {
    console.error('update-inventory error:', err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};


// ── Helpers ──────────────────────────────────────────────────────────────────

async function githubGet(token, repo, branch) {
  const url = `https://api.github.com/repos/${repo}/contents/data/inventory.json?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'natural-abundance-nursery',
    },
  });
  if (!res.ok) throw new Error(`GitHub GET ${res.status}: ${await res.text()}`);
  return res.json();
}

async function githubPut(token, repo, branch, inventory, sha, message) {
  const url = `https://api.github.com/repos/${repo}/contents/data/inventory.json`;
  const body = JSON.stringify({
    message,
    content: Buffer.from(JSON.stringify(inventory, null, 2) + '\n').toString('base64'),
    sha,
    branch,
  });
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'natural-abundance-nursery',
    },
    body,
  });
  if (!res.ok) throw new Error(`GitHub PUT ${res.status}: ${await res.text()}`);
  return res.json();
}
