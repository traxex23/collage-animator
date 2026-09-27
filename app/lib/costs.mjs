// Per-project spend ledger. Estimates are charged before a call (and checked against the cap);
// when a provider reports the real cost (xAI usage ticks), the entry is corrected.
import fs from 'node:fs';
import { dir, load } from './projects.mjs';

const file = slug => dir(slug, 'costs.json');

export function ledger(slug) {
  return fs.existsSync(file(slug)) ? JSON.parse(fs.readFileSync(file(slug), 'utf8')) : { items: [] };
}

export function summary(slug) {
  const { items } = ledger(slug);
  const byProvider = {};
  let total = 0;
  for (const i of items) { byProvider[i.provider] = (byProvider[i.provider] || 0) + i.usd; total += i.usd; }
  return { total: +total.toFixed(3), byProvider: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, +v.toFixed(3)])), count: items.length };
}

export class BudgetError extends Error {}

// Returns an entry id so the caller can correct it with the provider-reported cost.
export function charge(slug, provider, what, usd) {
  const p = load(slug);
  if (p.settings.mock) usd = 0;
  const l = ledger(slug), total = l.items.reduce((s, i) => s + i.usd, 0);
  if (total + usd > p.settings.budget + 1e-9) {
    throw new BudgetError(`Budget cap reached: $${total.toFixed(2)} spent of $${p.settings.budget}; "${what}" needs ~$${usd.toFixed(2)}. Raise the cap in Settings to continue.`);
  }
  const id = `${Date.now()}-${l.items.length}`;
  l.items.push({ id, provider: p.settings.mock ? 'mock' : provider, what, usd: +usd.toFixed(4), estimated: true, at: new Date().toISOString() });
  fs.writeFileSync(file(slug), JSON.stringify(l, null, 1));
  return id;
}

export function settle(slug, id, usd) {
  const l = ledger(slug), e = l.items.find(i => i.id === id);
  if (!e || e.provider === 'mock') return;
  e.usd = +usd.toFixed(4); e.estimated = false;
  fs.writeFileSync(file(slug), JSON.stringify(l, null, 1));
}

// Refund an estimate when the call failed before the provider billed it.
export function refund(slug, id) {
  const l = ledger(slug);
  l.items = l.items.filter(i => i.id !== id);
  fs.writeFileSync(file(slug), JSON.stringify(l, null, 1));
}
