import "server-only";

export interface MutationJournalEntry {
  mutationId: string;
  timestamp: string;
  action: string;
  beforeQueueState: string[];
  afterQueueState: string[];
  rollbackAvailable: boolean;
  rollbackExecuted: boolean;
  success: boolean;
  recoveryUsed?: string;
  executionOutcome?: string;
}

const journalStore = new Map<string, MutationJournalEntry[]>();
const MAX_ENTRIES = 50;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function recordMutation(params: {
  userId: string;
  action: string;
  beforeQueueState: string[];
  afterQueueState: string[];
  success: boolean;
  rollbackAvailable?: boolean;
  rollbackExecuted?: boolean;
  recoveryUsed?: string;
  executionOutcome?: string;
}): MutationJournalEntry {
  const entry: MutationJournalEntry = {
    mutationId: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    action: params.action,
    beforeQueueState: [...params.beforeQueueState],
    afterQueueState: [...params.afterQueueState],
    rollbackAvailable: params.rollbackAvailable ?? params.success,
    rollbackExecuted: params.rollbackExecuted ?? false,
    success: params.success,
    recoveryUsed: params.recoveryUsed,
    executionOutcome: params.executionOutcome,
  };
  const existing = journalStore.get(params.userId) ?? [];
  journalStore.set(params.userId, [entry, ...existing].slice(0, MAX_ENTRIES));
  console.log("[MUTATION] journal entry recorded", {
    mutationId: entry.mutationId,
    action: entry.action,
    success: entry.success,
  });
  return entry;
}

export function getMutationHistory(userId: string): MutationJournalEntry[] {
  return journalStore.get(userId) ?? [];
}

export function computeMutationReliability(userId: string): number {
  const history = getMutationHistory(userId);
  if (!history.length) return 62;
  const successes = history.filter((e) => e.success).length;
  const rollbacks = history.filter((e) => e.rollbackExecuted).length;
  const reliability = Number(
    clamp((successes / history.length) * 70 + (1 - rollbacks / Math.max(history.length, 1)) * 20 + 10, 0, 100).toFixed(
      2,
    ),
  );
  console.log("[MUTATION] reliability updated", { userId, reliability, sampleCount: history.length });
  return reliability;
}
