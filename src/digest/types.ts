// The night's run log, read into one row per job (plan.md § 1).
// Section 2 (page, JSON, board link, route tests) builds on these types only.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** A row is marked on the page when it retried this many times or more. */
export const MARK_RETRIES = 3;

export type DigestRow = {
  job: string;
  /** Last non-null owner logged for the job; null renders as `—`. */
  owner: string | null;
  /** Lines logged for the job. */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  /** Lines with status `fail`. */
  fails: number;
  /** Status of the job's latest line. */
  lastStatus: RunStatus;
  /** Most recent `error` logged for the job, even if a later line was ok; null if none. */
  lastError: string | null;
  /** `at` of the earliest and latest line, exactly as logged (offset kept, never UTC). */
  first: string;
  last: string;
  /** retries >= MARK_RETRIES or any fail. Page and JSON read this, never recompute it. */
  marked: boolean;
};

export type Night = {
  /** YYYY-MM-DD, as in `runs/<night>.jsonl`. */
  night: string;
  /** Sorted by job (plain code-point order). Empty for an empty file: "nothing ran". */
  rows: DigestRow[];
  /** Non-blank lines that didn't parse into a run; counted, never thrown. */
  badLines: number;
  /** Parsed lines per status, for the board's ok / retry / fail counts. */
  counts: Record<RunStatus, number>;
};

/**
 * Reads `<runsDir>/<night>.jsonl`.
 * Returns null when there is no such night (no file, or `night` isn't YYYY-MM-DD): a 404.
 * Throws only on I/O errors other than a missing file.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
