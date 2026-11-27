// These are published dates, never forecasts of the UF.
// https://www.sii.cl/normativa_legislacion/circulares/2026/circu43.pdf
const officialFallback = Object.freeze({ date: '2026-11-27', pesos: 41419.22, source: 'SII' });
export const UF_API_URL = 'https://valor-uf.cl/api/v1/uf/hoy.json';
const mirrorSource = 'SII vía Valor UF';
const cacheKey = 'mlr-uf-published-dates-v1';
const oneDay = 86_400_000;
const retryDelay = 15 * 60_000;
const localDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
});
const decimals = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const updatedDate = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short'
});

export function santiagoDate(date = new Date()) {
  return localDate.format(date);
}

function validQuote(quote) {
  if (typeof quote?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) return false;
  const date = new Date(`${quote.date}T00:00:00Z`);
  const { pesos } = quote;
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === quote.date
    && Number.isSafeInteger(Math.round(pesos * 100)) && pesos > 0 && Math.round(pesos * 100) / 100 === pesos;
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) return null;
  const date = new Date(value);
  const iso = value.includes('.') ? value : value.replace('Z', '.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString() === iso ? iso : null;
}

function normalizeRows(rows) {
  const results = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) if (validQuote(row)) results.set(row.date, {
      date: row.date, pesos: row.pesos, source: mirrorSource, updatedAt: validTimestamp(row.updatedAt)
    });
  }
  return results;
}

export function parsePublishedUf(payload, today, checkedAt) {
  if (payload?.unidad !== 'UF' || payload.moneda !== 'CLP') return new Map();
  const stamp = validTimestamp(payload.actualizado);
  const updatedAt = stamp && Date.parse(stamp) <= Date.parse(checkedAt) ? stamp : checkedAt;
  const first = { date: payload.fecha, pesos: payload.valor, updatedAt };
  if (!validQuote(first) || first.date > today) return new Map();
  const limit = new Date(Date.parse(first.date) + 31 * oneDay).toISOString().slice(0, 10);
  const following = Array.isArray(payload.publicados_por_adelantado) ? payload.publicados_por_adelantado : [];
  return normalizeRows([first, ...following.filter(row => row?.fecha > first.date && row.fecha <= limit)
    .map(row => ({ date: row.fecha, pesos: row.valor, updatedAt }))]);
}

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return null; }
}

export function createUfReference({ now = () => new Date(), request = globalThis.fetch, storage = browserStorage() } = {}) {
  let published;
  try { published = normalizeRows(JSON.parse(storage?.getItem(cacheKey) ?? '[]')); }
  catch { published = new Map(); }
  let lastAttempt, checkedDate, pending;

  function current() {
    const today = santiagoDate(now());
    let quote = officialFallback.date <= today ? officialFallback : null;
    for (const item of published.values()) {
      if (item.date <= today && (!quote || item.date >= quote.date)) quote = item;
    }
    return quote ? { ...quote, stale: quote.date < today } : null;
  }

  function refresh({ retry = false } = {}) {
    if (pending) return pending;
    const timestamp = now();
    const today = santiagoDate(timestamp);
    const elapsed = timestamp.getTime() - lastAttempt?.time;
    if (checkedDate === today || (!retry && lastAttempt?.date === today && elapsed >= 0 && elapsed < retryDelay)) {
      return Promise.resolve(current());
    }
    lastAttempt = { date: today, time: timestamp.getTime() };
    pending = (async () => {
      try {
        const response = await request(UF_API_URL, { credentials: 'omit', redirect: 'error', cache: 'no-cache', signal: AbortSignal.timeout(6000) });
        if (response.ok) {
          const checkedAt = now();
          const effectiveDate = santiagoDate(checkedAt);
          const received = parsePublishedUf(await response.json(), effectiveDate, checkedAt.toISOString());
          if (received.size) {
            const rows = [...new Map([...published, ...received]).values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-40);
            published = new Map(rows.map(row => [row.date, row]));
            if (received.has(effectiveDate)) checkedDate = effectiveDate;
            try { storage?.setItem(cacheKey, JSON.stringify(rows)); } catch {}
          }
        }
      } catch {
        // Keep the latest dated quote when the provider or connection is unavailable.
      }
      return current();
    })().finally(() => { pending = null; });
    return pending;
  }

  return { current, refresh };
}

export function ufAmount(pesos) {
  const node = document.createElement('small');
  node.dataset.ufPesos = String(pesos);
  return node;
}

export function ufFootnote(prefix = '') {
  const node = document.createElement('p');
  node.className = 'companion-footnote';
  node.dataset.ufFootnote = prefix;
  const summary = document.createElement('span');
  const updated = document.createElement('span');
  updated.className = 'companion-uf-updated';
  node.append(summary, updated);
  return node;
}

export function updateUfReadouts(root, quote) {
  for (const node of root.querySelectorAll('[data-uf-pesos]')) {
    const value = Number(node.dataset.ufPesos);
    const label = quote && Number.isFinite(value) ? `${decimals.format(value / quote.pesos)} UF` : '— UF';
    if (node.textContent !== label) node.textContent = label;
  }
  for (const node of root.querySelectorAll('[data-uf-footnote]')) {
    const reference = quote
      ? `UF del ${quote.date.split('-').reverse().join('/')} · $${decimals.format(quote.pesos)}`
      : 'Valor de UF no disponible';
    const label = [node.dataset.ufFootnote, reference, quote?.stale ? 'Último valor disponible' : ''].filter(Boolean).join(' · ');
    if (node.firstElementChild.textContent !== label) node.firstElementChild.textContent = label;
    const updated = quote?.updatedAt ? ` Última actualización: ${updatedDate.format(new Date(quote.updatedAt))} (hora de Chile).` : '';
    if (node.lastElementChild.textContent !== updated) node.lastElementChild.textContent = updated;
    if (node.title !== updated.trim()) node.title = updated.trim();
  }
}
