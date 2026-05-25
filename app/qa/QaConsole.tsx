"use client";

import { useMemo, useState } from "react";
import {
  createQaIncident,
  createRuntimeQaStatus,
  type QaIncident,
  type QaRecoveryTest,
  type RuntimeQaStatus,
} from "@/lib/runtime/qa";

type QaConsoleProps = {
  initialStatus: RuntimeQaStatus;
  initialRecoveryTests: QaRecoveryTest[];
};

export function QaConsole({ initialStatus, initialRecoveryTests }: QaConsoleProps) {
  const [, setStatus] = useState(initialStatus);
  const [recoveryTests, setRecoveryTests] = useState(initialRecoveryTests);
  const [incidents, setIncidents] = useState<QaIncident[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const unresolvedIncidents = useMemo(
    () => incidents.filter((incident) => !incident.resolved),
    [incidents],
  );

  function resolveIncident(incidentId: string) {
    setIncidents((current) =>
      current.map((incident) => (incident.id === incidentId ? { ...incident, resolved: true } : incident)),
    );
  }

  function logIncident(
    params: Omit<QaIncident, "id" | "createdAt" | "resolved"> & { refreshStatus?: boolean },
  ) {
    const next = createQaIncident(params);
    setIncidents((current) => [next, ...current].slice(0, 40));
    if (params.refreshStatus) {
      setStatus(() =>
        createRuntimeQaStatus({
          deployment: null,
          reliability: null,
          performance: null,
          spotifyConnected: false,
          sessionPersistenceHealthy: false,
          simulationVerified: true,
          operatorFlowComplete: true,
          incidents: [next, ...incidents].slice(0, 40),
        }),
      );
    }
  }

  async function runRecoveryAction(action: QaRecoveryTest["action"]) {
    setBusyAction(action);
    const testId = recoveryTests.find((test) => test.action === action)?.id;
    const now = new Date().toISOString();

    try {
      if (action === "reconnect") {
        const response = await fetch("/api/runtime/recovery/reconnect", { method: "POST" });
        const ok = response.ok;
        setRecoveryTests((tests) =>
          tests.map((test) =>
            test.id === testId
              ? { ...test, lastRunAt: now, lastResult: ok ? "pass" : "warn" }
              : test,
          ),
        );
        if (!ok) {
          logIncident({
            severity: "high",
            category: "recovery",
            marker: "incident",
            title: "Reconnect QA test returned warning/failure.",
            detail: "Review reconnect diagnostics before beta event.",
          });
        }
      } else if (action === "resync") {
        const response = await fetch("/api/runtime/recovery/resync", { method: "POST" });
        const ok = response.ok;
        setRecoveryTests((tests) =>
          tests.map((test) =>
            test.id === testId
              ? { ...test, lastRunAt: now, lastResult: ok ? "pass" : "warn" }
              : test,
          ),
        );
        if (!ok) {
          logIncident({
            severity: "medium",
            category: "recovery",
            marker: "incident",
            title: "Resync QA test failed to recover sync.",
            detail: "Retry resync and verify active Spotify device.",
          });
        }
      } else if (action === "stale_state") {
        setRecoveryTests((tests) =>
          tests.map((test) =>
            test.id === testId ? { ...test, lastRunAt: now, lastResult: "pass" } : test,
          ),
        );
        logIncident({
          severity: "medium",
          category: "state",
          marker: "anomaly",
          title: "Stale-state simulation marker created.",
          detail: "Confirm stale-state recovery path and checkpoint behavior.",
        });
      } else if (action === "offline_mode") {
        setRecoveryTests((tests) =>
          tests.map((test) =>
            test.id === testId ? { ...test, lastRunAt: now, lastResult: "pass" } : test,
          ),
        );
        logIncident({
          severity: "high",
          category: "connectivity",
          marker: "anomaly",
          title: "Offline-mode simulation marker created.",
          detail: "Validate degraded-mode operator behavior and retry spacing.",
        });
      } else if (action === "queue_exhaustion") {
        setRecoveryTests((tests) =>
          tests.map((test) =>
            test.id === testId ? { ...test, lastRunAt: now, lastResult: "pass" } : test,
          ),
        );
        logIncident({
          severity: "medium",
          category: "operator",
          marker: "anomaly",
          title: "Queue exhaustion test marker created.",
          detail: "Validate fallback recommendations and safe continuity messaging.",
        });
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <article className="glass-panel rounded-2xl p-4 md:p-5">
        <h2 className="text-lg font-semibold">Quick Runtime Validation Actions</h2>
        <p className="mt-1 text-sm text-white/70">
          Reconnect/recovery tests and simulated anomaly markers for internal QA.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recoveryTests.map((test) => (
            <div key={test.id} className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
              <p className="font-medium">{test.label}</p>
              <p className="mt-1 text-xs text-white/70">{test.expectedOutcome}</p>
              <p className="mt-2 text-[11px] text-white/60">
                Status: {test.lastResult.replaceAll("_", " ")} {test.lastRunAt ? `| ${new Date(test.lastRunAt).toLocaleTimeString()}` : ""}
              </p>
              <button
                onClick={() => void runRecoveryAction(test.action)}
                disabled={busyAction === test.action}
                className="mt-2 min-h-10 w-full rounded-xl border border-purple-300/40 bg-purple-500/10 px-3 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/20 disabled:opacity-60"
              >
                {busyAction === test.action ? "Running..." : `Run ${test.action.replaceAll("_", " ")}`}
              </button>
            </div>
          ))}
        </div>
      </article>

      <article className="glass-panel rounded-2xl p-4 md:p-5">
        <h2 className="text-lg font-semibold">QA Incident & Anomaly Log</h2>
        <p className="mt-1 text-sm text-white/70">
          Internal-only runtime incident logging for beta readiness tracking.
        </p>
        <p className="mt-2 text-xs text-white/60">Unresolved incidents: {unresolvedIncidents.length}</p>
        <div className="mt-3 space-y-2">
          {incidents.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/70">
              No QA incidents logged yet.
            </p>
          ) : (
            incidents.map((incident) => (
              <div key={incident.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{incident.title}</p>
                  <span className="text-[10px] uppercase tracking-wider text-white/60">
                    {incident.marker} | {incident.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/70">{incident.detail}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-white/55">{new Date(incident.createdAt).toLocaleString()}</p>
                  {!incident.resolved ? (
                    <button
                      onClick={() => resolveIncident(incident.id)}
                      className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-100 hover:bg-emerald-500/20"
                    >
                      Mark Resolved
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-emerald-200">resolved</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </article>
    </>
  );
}

