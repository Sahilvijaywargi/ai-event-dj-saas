"use client";

import { useCallback, useEffect, useState } from "react";

type RetentionStatusPayload = {
  status: {
    totalRows: number;
    rowsEligibleForPruning: number;
    oldestAuditTimestamp: string | null;
    estimatedStorageBytes: number;
    currentRetentionPolicy: { windowDays: 30 | 60 | 90; maxBatchSize: number };
  };
  cutoff: string;
  governance?: {
    retention_window_days: 30 | 60 | 90;
    auto_prune_enabled: boolean;
    scheduled_prune_interval_hours: number;
    last_prune_at: string | null;
    next_prune_at: string | null;
  };
};

type PruneResultPayload = {
  dryRun: boolean;
  deletedRows: number;
  eligibleRows: number;
  batchCount: number;
  executionMs: number;
  errors: string[];
  cutoffTimestamp: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AuditRetentionPanel() {
  const [windowDays, setWindowDays] = useState<30 | 60 | 90>(60);
  const [autoPruneEnabled, setAutoPruneEnabled] = useState(false);
  const [scheduledHours, setScheduledHours] = useState(24);
  const [status, setStatus] = useState<RetentionStatusPayload | null>(null);
  const [lastPrune, setLastPrune] = useState<PruneResultPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/spotify/playback/audit/retention-status?windowDays=${windowDays}`,
      );
      const data = (await response.json()) as RetentionStatusPayload;
      if (!response.ok) {
        throw new Error((data as { message?: string }).message ?? "Failed to load retention status.");
      }
      setStatus(data);
      if (data.governance) {
        setAutoPruneEnabled(data.governance.auto_prune_enabled);
        setScheduledHours(data.governance.scheduled_prune_interval_hours);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load retention status.");
    } finally {
      setIsLoading(false);
    }
  }, [windowDays]);

  const saveGovernance = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/spotify/playback/audit/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retentionWindowDays: windowDays,
          autoPruneEnabled,
          scheduledPruneIntervalHours: scheduledHours,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to save governance.");
      }
      await refreshStatus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save governance.");
    } finally {
      setIsLoading(false);
    }
  }, [windowDays, autoPruneEnabled, scheduledHours, refreshStatus]);

  async function runPrune(dryRun: boolean) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/spotify/playback/audit/prune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays, dryRun }),
      });
      const data = (await response.json()) as PruneResultPayload;
      if (!response.ok) {
        throw new Error((data as { message?: string }).message ?? "Failed to run prune.");
      }
      setLastPrune(data);
      await refreshStatus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to run prune.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshStatus();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshStatus]);

  return (
    <article id="audit-retention" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Audit Retention</h2>
          <p className="mt-1 text-sm text-white/65">
            Operational lifecycle controls for playback audit retention and cleanup.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value) as 30 | 60 | 90)}
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={autoPruneEnabled}
              onChange={(event) => setAutoPruneEnabled(event.target.checked)}
            />
            Auto-prune
          </label>
          <select
            value={scheduledHours}
            onChange={(event) => setScheduledHours(Math.max(1, Math.min(720, Number(event.target.value))))}
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
          >
            <option value={6}>Every 6h</option>
            <option value={12}>Every 12h</option>
            <option value={24}>Every 24h</option>
            <option value={48}>Every 48h</option>
            <option value={72}>Every 72h</option>
          </select>
          <button
            onClick={saveGovernance}
            disabled={isLoading}
            className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
          >
            Save Policy
          </button>
          <button
            onClick={refreshStatus}
            disabled={isLoading}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Policy</p>
          <p className="mt-1 font-semibold">{status?.status.currentRetentionPolicy.windowDays ?? windowDays} days</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Total Rows</p>
          <p className="mt-1 font-semibold">{status?.status.totalRows ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Eligible</p>
          <p className="mt-1 font-semibold">{status?.status.rowsEligibleForPruning ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Storage Estimate</p>
          <p className="mt-1 font-semibold">
            {formatBytes(status?.status.estimatedStorageBytes ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Oldest Audit</p>
          <p className="mt-1 text-xs font-semibold">
            {status?.status.oldestAuditTimestamp
              ? new Date(status.status.oldestAuditTimestamp).toLocaleString()
              : "N/A"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Governance</p>
          <p className="mt-1 font-semibold">{autoPruneEnabled ? "Auto-prune enabled" : "Manual mode"}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => runPrune(true)}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          Dry Run Preview
        </button>
        <button
          onClick={() => runPrune(false)}
          disabled={isLoading}
          className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
        >
          Execute Prune
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
        <p className="font-semibold text-white">Governance Schedule</p>
        <p className="mt-1">
          Interval: every {scheduledHours}h | Next cleanup:{" "}
          {status?.governance?.next_prune_at
            ? new Date(status.governance.next_prune_at).toLocaleString()
            : "Not scheduled"}
        </p>
        <p>
          Last prune:{" "}
          {status?.governance?.last_prune_at
            ? new Date(status.governance.last_prune_at).toLocaleString()
            : "Never"}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
        <p className="font-semibold text-white">Last Prune Execution</p>
        {lastPrune ? (
          <>
            <p className="mt-1">
              Mode: {lastPrune.dryRun ? "Dry-run" : "Delete"} | Eligible: {lastPrune.eligibleRows} |
              Deleted: {lastPrune.deletedRows}
            </p>
            <p>
              Batches: {lastPrune.batchCount} | Execution: {lastPrune.executionMs}ms
            </p>
            <p>Cutoff: {new Date(lastPrune.cutoffTimestamp).toLocaleString()}</p>
            {lastPrune.errors.length ? (
              <p className="text-red-200">Errors: {lastPrune.errors.join("; ")}</p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-white/60">No prune execution yet.</p>
        )}
      </div>
    </article>
  );
}

