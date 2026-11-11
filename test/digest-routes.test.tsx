import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const line = (o: object) => JSON.stringify(o);

let tmp: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(
    join(tmp, '2026-01-01.jsonl'),
    [
      line({ at: '2026-01-01T02:00:00+01:00', job: 'zeta', status: 'ok', owner: 'ann' }),
      line({ at: '2026-01-01T01:00:00+01:00', job: 'alpha', status: 'fail', error: 'boom' }),
      line({ at: '2026-01-01T01:30:00+01:00', job: 'alpha', status: 'ok' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(tmp, '2026-01-02.jsonl'), '');
  writeFileSync(
    join(tmp, '2026-01-03.jsonl'),
    [
      line({ at: '2026-01-03T01:00:00+01:00', job: 'beta', status: 'ok' }),
      'not json {',
      line({ at: '2026-01-03T01:05:00+01:00', job: 'alpha', status: 'retry' }),
    ].join('\n') + '\n',
  );
  app = createApp({ ...base, runsDir: tmp });
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const pageJobs = (html: string) => [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);

describe('GET /api/digest/:night', () => {
  it('200 with the night as JSON', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'zeta']);
    expect(body.counts).toEqual({ ok: 2, retry: 0, fail: 1 });
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('empty night: 200, rows []', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('bad line is counted and skipped', async () => {
    const res = await app.request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'beta']);
  });
});

describe('GET /digest/:night', () => {
  it('200 with the jobs listed', async () => {
    const res = await app.request('/digest/2026-01-01');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('digest · 2026-01-01');
    expect(pageJobs(html)).toEqual(['alpha', 'zeta']);
    expect(html).toContain('boom');
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2020-01-01');
    expect(res.status).toBe(404);
  });

  it('empty night shows "nothing ran"', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);
  });

  it('bad line shows the warning and keeps the good rows', async () => {
    const res = await app.request('/digest/2026-01-03');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('1 bad line skipped');
    expect(pageJobs(html)).toEqual(['alpha', 'beta']);
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-01-01', '2026-01-02', '2026-01-03'])('%s lists the same jobs in the same order', async (n) => {
    const api = (await (await app.request(`/api/digest/${n}`)).json()) as Night;
    const html = await (await app.request(`/digest/${n}`)).text();
    expect(pageJobs(html)).toEqual(api.rows.map((r) => r.job));
  });
});
