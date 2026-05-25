"use client";

import { useEffect, useState } from "react";

type AuditRow = {
  id: string;
  command_type: string;
  target_device_id: string | null;
  execution_status: "success" | "failed" | "blocked";
  execution_source: string;
  failure_reason: string | null;
  executed_at: string;
  command_payload: { latencyMs?: number; guardrails?: Array<{ code: string; message: string }> };
};

export function PlaybackSafetyAuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshAudit() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/spotify/playback/audit?limit=12");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load playback audit.");
      }
      setRows((data.entries ?? []) as AuditRow[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load playback audit.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void refreshAudit();
    }, 0);
    const timer = setInterval(() => {
      void refreshAudit();
    }, 9000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);

  return (
    <article id="playback-safety-audit" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Playback Safety + Audit</h2>
          <p className="mt-1 text-sm text-white/65">
            Guardrail outcomes, command failures, latency, and device consistency telemetry.
          </p>
        </div>
        <button
          onClick={refreshAudit}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-black/25 p-5 text-sm text-white/70">
          No playback audit activity yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-white/10 bg-black/35 p-3 text-xs md:text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">
                  {row.command_type.replaceAll("_", " ")} - {row.execution_status}
                </p>
                <p className="text-white/60">{new Date(row.executed_at).toLocaleTimeString()}</p>
              </div>
              <p className="mt-1 text-white/70">
                Source: {row.execution_source} | Device: {row.target_device_id ?? "N/A"} | Latency:{" "}
                {row.command_payload?.latencyMs ?? 0}ms
              </p>
              {row.failure_reason ? (
                <p className="mt-1 text-red-200">Failure: {row.failure_reason}</p>
              ) : null}
              {row.command_payload?.guardrails?.length ? (
                <p className="mt-1 text-amber-200">
                  Guardrails: {row.command_payload.guardrails.map((g) => g.code).join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

