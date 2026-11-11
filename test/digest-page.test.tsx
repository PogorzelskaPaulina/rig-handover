import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest page', () => {
  it('renders 2026-10-28 with marked rows and the bad-line count', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('fixtures/refresh');
    expect(html).toContain('class="warn"');
    expect(html).toContain('1 bad line');
    expect(html).toContain('—');
  });

  it('404s for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2020-01-01');
    expect(res.status).toBe(404);
  });
});
