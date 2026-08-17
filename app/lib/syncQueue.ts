export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type QueueEntry = { leagueId: string; lastSyncedUpdatedAt: number; status: SyncStatus; attempts: number; lastAttemptAt: number; lastError: string };

const QUEUE_KEY = "awr:sync-queue";
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function readQueue(): Record<string, QueueEntry> {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, QueueEntry>) : {};
  } catch {
    return {};
  }
}

function writeQueue(queue: Record<string, QueueEntry>): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueueEntry(leagueId: string): QueueEntry | null {
  return readQueue()[leagueId] || null;
}

/** True when the league has local changes (a newer `updatedAt`) that D1 has not confirmed yet — survives a page refresh since it's derived from data already on disk. */
export function needsSync(leagueId: string, leagueUpdatedAt: number): boolean {
  const entry = getQueueEntry(leagueId);
  if (!entry) return true;
  return entry.lastSyncedUpdatedAt < leagueUpdatedAt || entry.status === "failed";
}

export function markSyncing(leagueId: string): void {
  const queue = readQueue();
  const existing = queue[leagueId];
  queue[leagueId] = { leagueId, lastSyncedUpdatedAt: existing?.lastSyncedUpdatedAt ?? 0, status: "syncing", attempts: existing?.attempts ?? 0, lastAttemptAt: Date.now(), lastError: "" };
  writeQueue(queue);
}

export function markSynced(leagueId: string, updatedAt: number): void {
  const queue = readQueue();
  queue[leagueId] = { leagueId, lastSyncedUpdatedAt: updatedAt, status: "synced", attempts: 0, lastAttemptAt: Date.now(), lastError: "" };
  writeQueue(queue);
}

export function markFailed(leagueId: string, error: string): void {
  const queue = readQueue();
  const existing = queue[leagueId];
  queue[leagueId] = { leagueId, lastSyncedUpdatedAt: existing?.lastSyncedUpdatedAt ?? 0, status: "failed", attempts: (existing?.attempts ?? 0) + 1, lastAttemptAt: Date.now(), lastError: error };
  writeQueue(queue);
}

export function clearQueueEntry(leagueId: string): void {
  const queue = readQueue();
  delete queue[leagueId];
  writeQueue(queue);
}

/** Exponential backoff capped at 30s, based on how many consecutive attempts have already failed. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempts);
}
