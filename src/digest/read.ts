import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARK_RETRIES, type DigestRow, type Night, type ReadNight, type RunStatus } from './types.js';

type Run = { at: string; time: number; job: string; status: RunStatus; owner: string | null; error: string | null };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

// The edge: one log line in, a Run or null out. Nothing past here sees raw JSON.
function parseLine(line: string): Run | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || typeof job !== 'string' || job === '' || !isStatus(status)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, time, job, status, owner: owner ?? null, error: error || null };
}

function toRow(job: string, runs: Run[]): DigestRow {
  // Stable sort: equal times keep file order.
  const sorted = [...runs].sort((a, b) => a.time - b.time);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const retries = runs.filter((r) => r.status === 'retry').length;
  const fails = runs.filter((r) => r.status === 'fail').length;
  return {
    job,
    owner: sorted.findLast((r) => r.owner !== null)?.owner ?? null,
    runs: runs.length,
    retries,
    fails,
    lastStatus: last.status,
    lastError: sorted.findLast((r) => r.error !== null)?.error ?? null,
    first: first.at,
    last: last.at,
    marked: retries >= MARK_RETRIES || fails > 0,
  };
}

export function parseNight(night: string, text: string): Night {
  const byJob = new Map<string, Run[]>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const run = parseLine(line);
    if (!run) {
      badLines++;
      continue;
    }
    counts[run.status]++;
    const list = byJob.get(run.job);
    if (list) list.push(run);
    else byJob.set(run.job, [run]);
  }
  const rows = [...byJob.entries()]
    .map(([job, runs]) => toRow(job, runs))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null; // also keeps `../` out of the path
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return parseNight(night, text);
};
