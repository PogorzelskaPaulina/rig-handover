import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest json', () => {
  it('returns the night the page reads, rows sorted by job', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    const body = (await res.json()) as { night: string; rows: { job: string }[] };
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.rows).toHaveLength(5);
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());
  });

  it('404s with a json body for a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2000-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });
});

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest with counts', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    for (const night of ['2026-10-27', '2026-10-28']) {
      expect(html).toContain(`href="/digest/${night}"`);
      expect((await app.request(`/digest/${night}`)).status).toBe(200);
    }
    expect(html).toMatch(/ok \d+ · retry \d+ · fail \d+/);
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
