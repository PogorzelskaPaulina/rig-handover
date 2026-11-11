import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('reads 5 jobs, sorted by job, and counts 1 bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('builds a row per job, times as logged', () => {
    const row = (job: string) => night.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      first: '2026-10-29T01:30:00+01:00',
      last: '2026-10-29T01:37:00+01:00',
      marked: true,
    });
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      first: '2026-10-28T23:00:06+01:00',
      last: '2026-10-29T05:00:04+01:00',
      marked: false,
    });
    expect(row('notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded', marked: true });
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastError: null, marked: false });
  });
});

describe('readNight on other nights', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);

  it('returns null for a night with no file, or a name that is not a night', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('reads an empty file as a night where nothing ran', () => {
    write('2026-01-02', '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts lines that do not parse, skips blank ones, never throws', () => {
    write(
      '2026-01-03',
      [
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
        '',
        'not json',
        '[]',
        '{"at":"2026-01-03T02:00:00+01:00","job":"a","status":"skipped","owner":"rook"}',
        '{"at":"later","job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-01-03T03:00:00+01:00","status":"ok","owner":"rook"}',
        '{"at":"2026-01-03T04:00:00+01:00","job":"a","status":"ok","owner":7}',
        '{"at":"2026-01-03T05:00:00+01:00","job":"a","status":"ok"}\r',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-03')!;
    expect(night.badLines).toBe(6);
    expect(night.rows).toHaveLength(1);
    expect(night.rows[0]).toMatchObject({ job: 'a', runs: 2, owner: 'rook', last: '2026-01-03T05:00:00+01:00' });
  });

  it('takes first, last and last status by time, not by line order', () => {
    write(
      '2026-01-04',
      [
        '{"at":"2026-01-04T03:00:00+01:00","job":"b","status":"fail","owner":"rook","error":"boom"}',
        '{"at":"2026-01-04T01:00:00+01:00","job":"b","status":"retry","owner":"rook","error":"slow"}',
        '{"at":"2026-01-04T02:00:00+01:00","job":"b","status":"retry","owner":"rook","error":"slow"}',
      ].join('\n'),
    );
    expect(readNight(dir, '2026-01-04')!.rows[0]).toMatchObject({
      first: '2026-01-04T01:00:00+01:00',
      last: '2026-01-04T03:00:00+01:00',
      lastStatus: 'fail',
      lastError: 'boom',
      retries: 2,
      marked: true,
    });
  });
});
