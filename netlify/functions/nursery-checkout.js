// nursery-checkout.js
// Called when a customer submits the nursery reservation form.
//
// Does three things, each independently fault-tolerant:
//   1. Emails Erik the full order (so nothing is ever missed)
//   2. Emails the customer a confirmation
//   3. Decrements inventory.json in GitHub → triggers Netlify rebuild → live site updates
//
// Required Netlify env vars:
//   GITHUB_TOKEN        — Personal Access Token with repo write scope
//   RESEND_API_KEY      — Resend API key (https://resend.com) for outgoing email
//
// Optional Netlify env vars:
//   GITHUB_REPO         — "NaturalAbundanceWeb/Natural-Abundance-site"
//   GITHUB_BRANCH       — "main" (default)
//   ORDER_NOTIFY_EMAIL  — where order alerts go (default erik@naturalabundance.co)
//   ORDER_FROM_EMAIL    — verified sender (default orders@naturalabundance.co)
//
// If RESEND_API_KEY is missing, orders still go through and Netlify Forms still
// records and notifies — the emails are simply skipped and logged.

'use strict';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Brand palette
const FOREST = '#2D5A3D';
const AMBER = '#E8A93B';
const CREAM = '#F5F0E8';
const SAND = '#EDE8DD';
const TEAL = '#5F7F7E';
const INK = '#1A1A1A';

const TAGLINE = 'From backyard gardens to working farms — designed, installed, and managed.';
const CONTACT_EMAIL = 'erik@naturalabundance.co';
const CONTACT_PHONE = '(530) 748-8158';
const VENMO_HANDLE = 'NaturalAbundanceHawaii';

exports.handler = async function (event) {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const params = new URLSearchParams(event.body);
    const order = {
      items: params.get('order-items') || '',
      subtotal: params.get('order-subtotal') || '',
      deposit: params.get('order-deposit') || '',
      fulfillment: params.get('fulfillment') || 'Not specified',
      window: params.get('delivery-window') || 'Not specified',
      address: params.get('delivery-address') || '',
      notes: params.get('order-notes') || '',
      name: params.get('name') || 'Unknown',
      phone: params.get('phone') || '',
      email: params.get('email') || '',
    };

    if (!order.items) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No order items' }) };
    }

    const items = parseOrderItems(order.items);
    if (items.length === 0) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Could not parse order items' }) };
    }

    // ── 1 & 2. Email Erik and the customer ────────────────────────────────
    // Runs first so a GitHub hiccup can never cost Erik the notification.
    const emailResult = await sendOrderEmails(order);

    // ── 3. Decrement inventory ────────────────────────────────────────────
    const inventoryResult = await decrementInventory(items, order);

    console.log('nursery-checkout:', JSON.stringify({ emailResult, inventoryResult, customer: order.email }));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, email: emailResult, inventory: inventoryResult }),
    };

  } catch (err) {
    console.error('nursery-checkout error:', err.message);
    // Return 200 — the customer flow must not break even if our side fails
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, error: err.message }) };
  }
};


// ── Email ────────────────────────────────────────────────────────────────────

async function sendOrderEmails(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.ORDER_NOTIFY_EMAIL || CONTACT_EMAIL;
  const from = process.env.ORDER_FROM_EMAIL || 'Natural Abundance <orders@naturalabundance.co>';

  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — order emails skipped');
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  const results = await Promise.allSettled([
    resendSend(apiKey, {
      from: from,
      to: [notifyTo],
      reply_to: order.email || undefined,
      subject: `New nursery order — ${order.name} (${order.subtotal})`,
      html: ownerEmailHtml(order),
      text: ownerEmailText(order),
    }),
    order.email
      ? resendSend(apiKey, {
          from: from,
          to: [order.email],
          reply_to: CONTACT_EMAIL,
          subject: customerSubject(order),
          html: customerEmailHtml(order),
          text: customerEmailText(order),
        })
      : Promise.resolve({ skipped: 'no customer email' }),
  ]);

  const owner = results[0].status === 'fulfilled';
  const customer = results[1].status === 'fulfilled';
  if (!owner) console.error('owner email failed:', results[0].reason && results[0].reason.message);
  if (!customer) console.error('customer email failed:', results[1].reason && results[1].reason.message);

  return { sent: owner || customer, owner: owner, customer: customer };
}

async function resendSend(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

function row(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:8px 14px 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:${FOREST};vertical-align:top;white-space:nowrap;">${esc(label)}</td>
    <td style="padding:8px 0;font-family:Georgia,serif;font-size:14px;color:${INK};vertical-align:top;">${esc(value)}</td>
  </tr>`;
}

function shell(innerHtml) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${SAND};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${FOREST};padding:22px 28px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:#FFFFFF;">Natural Abundance</div>
          <div style="width:50px;height:2.5px;background:${AMBER};margin-top:10px;"></div>
        </td></tr>
        <tr><td style="padding:28px;">${innerHtml}</td></tr>
        <tr><td style="background:${CREAM};padding:20px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${TEAL};line-height:1.7;">
          <div style="font-style:italic;font-family:Georgia,serif;color:${FOREST};margin-bottom:8px;">${TAGLINE}</div>
          <a href="mailto:${CONTACT_EMAIL}" style="color:${TEAL};text-decoration:none;">${CONTACT_EMAIL}</a> &nbsp;&middot;&nbsp;
          ${CONTACT_PHONE} &nbsp;&middot;&nbsp;
          <a href="https://naturalabundance.co" style="color:${TEAL};text-decoration:none;">naturalabundance.co</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function ownerEmailHtml(o) {
  return shell(`
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:bold;color:${FOREST};margin-bottom:4px;">New nursery order</div>
    <div style="font-family:Georgia,serif;font-size:14px;color:${TEAL};margin-bottom:20px;">${esc(o.name)} just reserved plants through the website.</div>

    <div style="background:${CREAM};border-radius:6px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-family:Georgia,serif;font-size:15px;color:${INK};margin-bottom:10px;"><strong>${esc(o.items)}</strong></div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};">
        Subtotal: <strong style="color:${FOREST};">${esc(o.subtotal)}</strong>
        &nbsp;&middot;&nbsp; Deposit: <strong style="color:${FOREST};">${esc(o.deposit)}</strong>
        <span style="color:${TEAL};">(check Venmo &mdash; not confirmed here)</span>
      </div>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row('Fulfillment', o.fulfillment)}
      ${row('Requested', o.window)}
      ${row('Address', o.address)}
      ${row('Name', o.name)}
      ${row('Phone', o.phone)}
      ${row('Email', o.email)}
      ${row('Notes', o.notes)}
    </table>

    <div style="margin-top:22px;padding-top:18px;border-top:1px solid ${SAND};font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${TEAL};line-height:1.7;">
      Inventory has been decremented automatically. Reply to this email to reach ${esc(o.name)} directly.
      They were sent a confirmation with their day and time, and a Venmo link in case they haven't paid yet.
    </div>
  `);
}

function ownerEmailText(o) {
  return [
    'NEW NURSERY ORDER',
    '',
    o.items,
    `Subtotal: ${o.subtotal}  |  Deposit: ${o.deposit} (check Venmo - not confirmed here)`,
    '',
    `Fulfillment: ${o.fulfillment}`,
    `Requested:   ${o.window}`,
    o.address ? `Address:     ${o.address}` : '',
    `Name:        ${o.name}`,
    `Phone:       ${o.phone}`,
    `Email:       ${o.email}`,
    o.notes ? `Notes:       ${o.notes}` : '',
    '',
    'Inventory has been decremented automatically.',
  ].filter(Boolean).join('\n');
}

// "Saturday, September 19 — morning (8:00–11:00 am)" → "Saturday, September 19"
function windowDate(w) {
  const head = String(w || '').split(' — ')[0].trim();
  if (!head || /^another time/i.test(head) || /^not specified/i.test(head)) return '';
  return head;
}

function customerSubject(o) {
  const date = windowDate(o.window);
  return date ? `Your plant reservation — ${date}` : 'Your plant reservation';
}

function customerEmailHtml(o) {
  const isDelivery = /delivery/i.test(o.fulfillment);
  const venmoUrl = `https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${encodeURIComponent(stripDollar(o.deposit))}&note=${encodeURIComponent('Natural Abundance plant reservation - ' + o.items)}`;

  return shell(`
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:bold;color:${FOREST};margin-bottom:4px;">Your reservation is in</div>
    <div style="font-family:Georgia,serif;font-size:14px;color:${TEAL};line-height:1.7;margin-bottom:20px;">
      Aloha ${esc(firstName(o.name))} &mdash; here's what we're holding for you.
    </div>

    <div style="background:${CREAM};border-radius:6px;padding:16px 18px;margin-bottom:18px;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:${TEAL};margin-bottom:6px;">${isDelivery ? 'Delivery' : 'Meet-up'}</div>
      <div style="font-family:Georgia,serif;font-size:16px;color:${FOREST};font-weight:bold;margin-bottom:4px;">${esc(o.window)}</div>
      <div style="font-family:Georgia,serif;font-size:14px;color:${INK};">${esc(o.fulfillment)}${o.address ? '<br>' + esc(o.address) : ''}</div>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:6px;">
      ${row('Plants', o.items)}
      ${row('Subtotal', o.subtotal)}
      ${row('Deposit', o.deposit)}
      ${row('Notes', o.notes)}
    </table>

    <div style="margin-top:22px;padding:14px 16px;background:${SAND};border-left:3px solid ${AMBER};border-radius:0 4px 4px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${INK};line-height:1.7;">
      Your ${esc(o.deposit)} deposit holds these plants for 7 days.
      <strong>If you've already sent it, you're all set.</strong>
      If not, you can send it
      <a href="${venmoUrl}" style="color:${FOREST};font-weight:bold;">by Venmo here</a>.
    </div>

    <div style="margin-top:18px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${TEAL};line-height:1.7;">
      The balance is due when you pick them up or we drop them off.
      Questions, or need a different day or time? Just reply to this email.
    </div>
  `);
}

function customerEmailText(o) {
  return [
    `Aloha ${firstName(o.name)},`,
    '',
    "Your reservation is in — here's what we're holding for you.",
    '',
    `${/delivery/i.test(o.fulfillment) ? 'DELIVERY' : 'MEET-UP'}: ${o.window}`,
    o.fulfillment,
    o.address ? o.address : '',
    '',
    `Plants:   ${o.items}`,
    `Subtotal: ${o.subtotal}`,
    `Deposit:  ${o.deposit}`,
    o.notes ? `Notes:    ${o.notes}` : '',
    '',
    `Your ${o.deposit} deposit holds these plants for 7 days. If you've already sent it,`,
    "you're all set. If not, you can send it by Venmo:",
    `https://venmo.com/${VENMO_HANDLE}`,
    '',
    'The balance is due when you pick them up or we drop them off.',
    'Questions, or need a different day or time? Just reply to this email.',
    '',
    'Natural Abundance',
    TAGLINE,
    `${CONTACT_EMAIL} | ${CONTACT_PHONE} | naturalabundance.co`,
  ].filter(Boolean).join('\n');
}


// ── Inventory ────────────────────────────────────────────────────────────────

async function decrementInventory(items, order) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'NaturalAbundanceWeb/Natural-Abundance-site';
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token) {
    console.error('GITHUB_TOKEN not set — inventory not decremented');
    return { updated: false, reason: 'GITHUB_TOKEN not configured' };
  }

  try {
    const fileData = await githubGet(token, repo, branch);
    const inventory = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    const changes = [];
    for (const item of items) {
      const plant = inventory.find(p => p.name.toLowerCase() === item.name.toLowerCase());
      if (plant) {
        const before = plant.available;
        plant.available = Math.max(0, plant.available - item.qty);
        changes.push(`${plant.name}: ${before} → ${plant.available}`);
      } else {
        console.warn(`nursery-checkout: plant not found in inventory: "${item.name}"`);
      }
    }

    if (changes.length === 0) {
      console.warn('nursery-checkout: no matching plants for order:', order.items);
      return { updated: false, reason: 'No plants matched' };
    }

    const commitMsg = `Checkout: ${order.name} reserved ${items.map(i => `${i.name} x${i.qty}`).join(', ')} [auto]`;
    await githubPut(token, repo, branch, inventory, fileData.sha, commitMsg);
    return { updated: true, changes: changes };

  } catch (err) {
    console.error('inventory decrement failed:', err.message);
    return { updated: false, reason: err.message };
  }
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function parseOrderItems(str) {
  // Handles: "Soursop x2, Ackee x1" or "Soursop x2"
  return str.split(',').map(s => {
    const m = s.trim().match(/^(.+?)\s+x(\d+)$/i);
    if (m) return { name: m[1].trim(), qty: parseInt(m[2], 10) };
    return null;
  }).filter(Boolean);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function firstName(full) {
  return String(full || '').trim().split(/\s+/)[0] || 'there';
}

function stripDollar(v) {
  return String(v || '').replace(/[^0-9.]/g, '') || '0';
}

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
