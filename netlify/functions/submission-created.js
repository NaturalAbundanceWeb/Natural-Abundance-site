// submission-created.js
// Netlify runs this automatically after every Netlify Forms submission.
//
// For client questionnaires (form names starting with "questionnaire-"), it emails
// Erik the full set of answers, laid out question by question, with the plant
// catalog grouped into Yes / Maybe / No. Reply-To is the client, so hitting Reply
// writes back to them.
//
// Question wording is read from the live questionnaire page, so new questions,
// add-ons, and new clients need no changes here.
//
// Uses the same Netlify env vars as nursery-checkout.js:
//   RESEND_API_KEY            (required for the email to send)
//   QUESTIONNAIRE_NOTIFY_EMAIL (optional, default erik@naturalabundance.co)
//   ORDER_FROM_EMAIL          (optional, default orders@naturalabundance.co)
//
// Other forms (contact, nursery) pass straight through untouched.

'use strict';

const FOREST = '#2D5A3D';
const AMBER = '#E8A93B';
const SAND = '#EDE8DD';
const TEAL = '#5F7F7E';
const INK = '#1A1A1A';

const SKIP = new Set(['form-name', 'company', 'bot-field', 'ip', 'user_agent', 'referrer']);

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (e) {
    console.error('Could not parse submission body');
    return { statusCode: 200, body: 'ignored' };
  }

  const formName = payload.form_name || '';
  if (!formName.startsWith('questionnaire-')) {
    return { statusCode: 200, body: 'not a questionnaire' };
  }

  const data = payload.data || {};
  const siteUrl = (payload.site_url || 'https://naturalabundance.co').replace(/\/$/, '');
  const pageUrl = data.referrer || `${siteUrl}/q/${formName.replace(/^questionnaire-/, '')}.html`;

  let labels = { questions: [], plants: {} };
  try {
    const res = await fetch(pageUrl);
    if (res.ok) labels = parseLabels(await res.text());
  } catch (e) {
    console.warn('Could not fetch questionnaire page for labels:', e.message);
  }

  const summary = buildSummary(formName, data, labels);
  const result = await sendEmail(summary);
  console.log('questionnaire email', formName, JSON.stringify(result));
  return { statusCode: 200, body: 'ok' };
};

// ── Read question wording from the page ─────────────────────────────────────

function parseLabels(html) {
  const questions = []; // [{ label, names: [] }] in page order
  const plants = {}; // field name → { name, layer }

  const fsRe = /<fieldset[^>]*>([\s\S]*?)<\/fieldset>/g;
  let m;
  while ((m = fsRe.exec(html))) {
    const body = m[1];
    const legend = (body.match(/<legend[^>]*>([\s\S]*?)<\/legend>/) || [])[1] || '';
    const numbered = /class="q-num"/.test(legend);
    const label = clean(legend.replace(/<span class="q-num">[\s\S]*?<\/span>/, ''));
    const names = uniq(allMatches(body, /\bname="([^"]+)"/g));
    if (names.length) questions.push({ label, names, numbered });
  }

  let layer = '';
  const rowRe = /<h3>([\s\S]*?)<\/h3>|<div class="cat-row"[^>]*aria-label="([^"]+)"[\s\S]*?name="([^"]+)"/g;
  while ((m = rowRe.exec(html))) {
    if (m[1]) layer = clean(m[1]);
    else plants[m[3]] = { name: decode(m[2]), layer };
  }
  return { questions, plants };
}

// ── Assemble the answers ────────────────────────────────────────────────────

function buildSummary(formName, data, labels) {
  const used = new Set();
  const get = (k) => {
    used.add(k);
    const v = data[k];
    if (Array.isArray(v)) return v.filter(Boolean).join('\n');
    return v == null ? '' : String(v).trim();
  };

  const name = get('name');
  const email = get('email');
  const client = get('client');

  const sections = [];
  const extras = []; // un-numbered questions (catalog write-in, anything else), shown after the plants
  let n = 0;
  for (const q of labels.questions) {
    if (q.names.every((k) => k === 'name' || k === 'email')) continue;
    const answer = q.names.map(get).filter(Boolean).join('\n');
    if (q.numbered) sections.push({ label: q.label, answer, num: ++n });
    else extras.push({ label: q.label, answer: answer || '' });
  }

  const groups = { Yes: [], Maybe: [], No: [] };
  for (const k of Object.keys(data)) {
    if (!k.startsWith('plant-')) continue;
    used.add(k);
    const v = String(data[k]);
    const p = labels.plants[k] || { name: pretty(k.replace(/^plant-/, '')), layer: '' };
    if (groups[v]) groups[v].push(p);
  }

  // Anything the page didn't describe (keeps future fields from vanishing)
  for (const k of Object.keys(data)) {
    if (used.has(k) || SKIP.has(k)) continue;
    const v = get(k);
    if (v) extras.push({ label: pretty(k), answer: v });
  }

  return { formName, name, email, client, sections, groups, extras };
}

// ── Email ───────────────────────────────────────────────────────────────────

async function sendEmail(s) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set, questionnaire email skipped');
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }
  const to = process.env.QUESTIONNAIRE_NOTIFY_EMAIL || 'erik@naturalabundance.co';
  const from = process.env.ORDER_FROM_EMAIL || 'Natural Abundance <orders@naturalabundance.co>';
  const who = s.client || s.name || s.formName;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: s.email || undefined,
      subject: `Questionnaire answers: ${who}`,
      html: emailHtml(s),
      text: emailText(s),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error', res.status, err);
    return { sent: false, status: res.status };
  }
  return { sent: true };
}

function plantList(list) {
  return list.map((p) => p.name).join(', ');
}

function emailText(s) {
  const out = [`Questionnaire answers from ${s.name || 'client'}`];
  if (s.client) out.push(s.client);
  if (s.email) out.push(s.email);
  out.push('');
  for (const q of s.sections) {
    out.push(`${q.num}. ${q.label}`, q.answer || '(left blank)', '');
  }
  for (const g of ['Yes', 'Maybe', 'No']) {
    if (s.groups[g].length) out.push(`Plants, ${g}: ${plantList(s.groups[g])}`, '');
  }
  for (const x of s.extras) out.push(x.label, x.answer || '(left blank)', '');
  return out.join('\n');
}

function emailHtml(s) {
  const qs = s.sections
    .map(
      (q) => `<tr><td style="padding:14px 0;border-bottom:1px solid ${SAND};">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:${FOREST};margin-bottom:6px;">${q.num}. ${esc(q.label)}</div>
      <div style="font-family:Georgia,serif;font-size:15px;line-height:1.5;color:${q.answer ? INK : TEAL};${q.answer ? '' : 'font-style:italic;'}">${q.answer ? nl2br(esc(q.answer)) : 'Left blank'}</div>
    </td></tr>`
    )
    .join('');

  const plantRows = ['Yes', 'Maybe', 'No']
    .filter((g) => s.groups[g].length)
    .map((g) => {
      const byLayer = {};
      for (const p of s.groups[g]) (byLayer[p.layer || 'Other'] = byLayer[p.layer || 'Other'] || []).push(p.name);
      const lines = Object.keys(byLayer)
        .map((l) => `<div style="margin:3px 0;"><span style="color:${TEAL};">${esc(l)}:</span> ${esc(byLayer[l].join(', '))}</div>`)
        .join('');
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${SAND};">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:${g === 'Yes' ? FOREST : g === 'Maybe' ? AMBER : TEAL};margin-bottom:6px;">${g} (${s.groups[g].length})</div>
        <div style="font-family:Georgia,serif;font-size:14px;line-height:1.5;color:${INK};">${lines}</div>
      </td></tr>`;
    })
    .join('');

  const extras = s.extras
    .map(
      (x) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${SAND};">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:${FOREST};margin-bottom:6px;">${esc(x.label)}</div>
      <div style="font-family:Georgia,serif;font-size:15px;line-height:1.5;color:${x.answer ? INK : TEAL};${x.answer ? '' : 'font-style:italic;'}">${x.answer ? nl2br(esc(x.answer)) : 'Left blank'}</div>
    </td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${SAND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;">
  <tr><td style="background:${FOREST};padding:22px 28px;">
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#F5F0E8;">Questionnaire answers</div>
    <div style="font-family:Georgia,serif;font-size:22px;color:#FFFFFF;margin-top:6px;">${esc(s.name || 'Client')}</div>
    <div style="width:50px;height:2.5px;background:${AMBER};margin-top:10px;"></div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#F5F0E8;margin-top:10px;">${esc(s.client)}${s.email ? `<br><a href="mailto:${esc(s.email)}" style="color:${AMBER};">${esc(s.email)}</a>` : ''}</div>
  </td></tr>
  <tr><td style="padding:8px 28px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${qs}
      ${plantRows ? `<tr><td style="padding:22px 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${TEAL};">Plant catalog</td></tr>${plantRows}` : ''}
      ${extras}
    </table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function allMatches(str, re) {
  const out = [];
  let m;
  while ((m = re.exec(str))) out.push(m[1]);
  return out;
}
function uniq(a) {
  return [...new Set(a)];
}
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
function clean(s) {
  return decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}
function pretty(k) {
  const s = k.replace(/\[\]$/, '').replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function nl2br(s) {
  return s.replace(/\n/g, '<br>');
}

// Exposed for local testing
exports._test = { parseLabels, buildSummary, emailText, emailHtml };
