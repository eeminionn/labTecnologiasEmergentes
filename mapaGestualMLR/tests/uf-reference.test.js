import test from 'node:test';
import assert from 'node:assert/strict';
import { createUfReference, parsePublishedUf, santiagoDate, UF_API_URL } from '../src/uf-reference.js';

const publication = {
  unidad: 'UF',
  moneda: 'CLP',
  fecha: '2026-11-27',
  valor: 41419.22,
  actualizado: '2026-11-27T03:02:27.317Z',
  publicados_por_adelantado: [
    { fecha: '2026-11-28', valor: 41426.11 },
    { fecha: '2026-11-29', valor: 41433 },
  ],
};

test('uses the calendar day in Santiago in summer and winter', () => {
  assert.equal(santiagoDate(new Date('2026-11-28T02:59:59Z')), '2026-11-27');
  assert.equal(santiagoDate(new Date('2026-11-28T03:00:00Z')), '2026-11-28');
  assert.equal(santiagoDate(new Date('2026-06-14T03:59:59Z')), '2026-06-13');
  assert.equal(santiagoDate(new Date('2026-06-14T04:00:00Z')), '2026-06-14');
});

test('rejects invalid and mislabeled amounts and validates official future publications and their source date', () => {
  const checkedAt = '2026-11-27T04:00:00Z';
  const table = parsePublishedUf({
    ...publication, publicados_por_adelantado: [
      ...publication.publicados_por_adelantado,
      { fecha: '2026-11-30', valor: -41440 },
      { fecha: '2026-12-01', valor: '41446.78' },
      { fecha: '2026-12-02', valor: 41453.678 },
      { fecha: '2026-12-31', valor: 41999 },
    ]
  }, '2026-11-27', checkedAt);
  assert.deepEqual([...table.keys()], ['2026-11-27', '2026-11-28', '2026-11-29']);
  assert.equal(table.get('2026-11-28').updatedAt, publication.actualizado);
  assert.equal(parsePublishedUf({ ...publication, moneda: 'USD' }, '2026-11-27', checkedAt).size, 0);
  assert.equal(parsePublishedUf(publication, '2026-11-26', checkedAt).size, 0);
  assert.equal(parsePublishedUf({ ...publication, fecha: '2026-11-31' }, '2026-12-01', checkedAt).size, 0);
  assert.equal(parsePublishedUf({ ...publication, actualizado: '2026-11-31T03:02:27.317Z' }, '2026-11-27', checkedAt)
    .get('2026-11-27').updatedAt, '2026-11-27T04:00:00.000Z');
});

test('fetches once per day, uses published dates offline and marks the last dated value as stale', async () => {
  let date = new Date('2026-11-27T04:00:00Z');
  let offline = false;
  let requests = 0;
  const cache = new Map();
  const storage = { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) };
  const options = {
    now: () => date,
    storage,
    request: async (url, init) => {
      assert.equal(url, UF_API_URL);
      assert.equal(init.credentials, 'omit');
      requests++;
      if (offline) throw new Error('Sin conexión');
      return { ok: true, json: async () => publication };
    },
  };
  const reference = createUfReference(options);
  assert.equal(reference.current().source, 'SII');
  await Promise.all([reference.refresh(), reference.refresh()]);
  assert.equal(requests, 1);
  assert.equal(reference.current().source, 'SII vía Valor UF');
  assert.equal(reference.current().updatedAt, publication.actualizado);
  await reference.refresh();
  assert.equal(requests, 1);

  offline = true;
  date = new Date('2026-11-28T03:00:00Z');
  assert.equal(reference.current().pesos, 41426.11);
  await reference.refresh();
  assert.equal(requests, 2);
  assert.equal(reference.current().stale, false);
  date = new Date('2026-11-28T03:01:00Z');
  await reference.refresh();
  assert.equal(requests, 2);
  await reference.refresh({ retry: true });
  assert.equal(requests, 3);

  date = new Date('2026-11-30T03:00:00Z');
  const reopened = createUfReference(options);
  const last = await reopened.refresh();
  assert.equal(last.date, '2026-11-29');
  assert.equal(last.pesos, 41433);
  assert.equal(last.stale, true);
});
