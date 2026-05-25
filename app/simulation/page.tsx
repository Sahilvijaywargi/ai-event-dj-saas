"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createSimulationExportReport,
  createScenarioFromPreset,
  runDeterministicSimulation,
  SimulationExportReport,
  SimulationPreset,
  SimulationRunResult,
  SimulationStressSignal,
} from "@/lib/simulation/runtime-simulator";
import {
  evaluateRuntimePerformanceState,
  getAdaptivePollingOptimization,
  getNetworkEfficiencyMetrics,
} from "@/lib/runtime/performance";

const PRESET_OPTIONS: Array<{ id: SimulationPreset; label: string }> = [
  { id: "wedding_reception", label: "Wedding Reception" },
  { id: "house_party", label: "House Party" },
  { id: "chill_lounge", label: "Chill Lounge" },
  { id: "high_energy_dance_event", label: "High-Energy Dance Event" },
];

const DURATION_OPTIONS = [
  { id: 120 as const, label: "2h" },
  { id: 240 as const, label: "4h" },
  { id: 360 as const, label: "6h" },
];

const SIGNAL_LABELS: Record<SimulationStressSignal["type"], string> = {
  crowd_energy_fluctuation: "Crowd Energy Fluctuations",
  spotify_reconnect_failure: "Spotify Reconnect Failures",
  stale_recommendations: "Stale Recommendations",
  operator_override: "Operator Overrides",
  network_degradation: "Network Degradation",
  playback_desync: "Playback Desync",
  queue_exhaustion: "Queue Exhaustion",
};

function statusColor(value: number) {
  if (value >= 75) return "text-emerald-100";
  if (value >= 50) return "text-amber-100";
  return "text-red-100";
}

export default function SimulationPage() {
  const [preset, setPreset] = useState<SimulationPreset>("wedding_reception");
  const [duration, setDuration] = useState<120 | 240 | 360>(120);
  const [seed, setSeed] = useState(42);
  const [allowPlaybackMutation, setAllowPlaybackMutation] = useState(false);
  const [signals, setSignals] = useState<SimulationStressSignal[]>(
    createScenarioFromPreset({ preset: "wedding_reception", durationMinutes: 120 }).stressSignals,
  );
  const [result, setResult] = useState<SimulationRunResult | null>(null);
  const [lastExportReport, setLastExportReport] = useState<SimulationExportReport | null>(null);
  const [lastExportAt, setLastExportAt] = useState<string | null>(null);
  const [sentryHealth, setSentryHealth] = useState<{
    sentryEnabled: boolean;
    clientConfigured: boolean;
    serverConfigured: boolean;
    environment: string;
    tracesEnabled: boolean;
    configWarnings: string[];
    runtimeReady: boolean;
  } | null>(null);
  const [deploymentReadiness, setDeploymentReadiness] = useState<{
    ready: boolean;
    buildValidation: {
      buildCompatible: boolean;
      runtimeCompatible: boolean;
      hydrationSafe: boolean;
      envReady: boolean;
      ssrSafe: boolean;
    };
    issues: Array<{ code: string; severity: "warning" | "error"; message: string; area: string }>;
    warnings: string[];
  } | null>(null);

  const latestHealth = result?.points[result.points.length - 1]?.runtimeHealth ?? 0;
  const latestConfidence = result?.points[result.points.length - 1]?.aiConfidence ?? 0;
  const healthSeries = useMemo(
    () =>
      (result?.points ?? [])
        .filter((_, idx, arr) => idx % Math.max(1, Math.floor(arr.length / 12)) === 0)
        .map((point) => `${Math.round(point.runtimeHealth)}`)
        .join(" -> "),
    [result],
  );

  function updateSignal(type: SimulationStressSignal["type"], patch: Partial<SimulationStressSignal>) {
    setSignals((current) =>
      current.map((signal) => (signal.type === type ? { ...signal, ...patch } : signal)),
    );
  }

  function applyPreset(nextPreset: SimulationPreset) {
    const nextScenario = createScenarioFromPreset({
      preset: nextPreset,
      durationMinutes: duration,
      seed,
    });
    setPreset(nextPreset);
    setSignals(nextScenario.stressSignals);
  }

  function runSimulation() {
    const scenario = {
      preset,
      durationMinutes: duration,
      deterministicSeed: seed,
      allowPlaybackMutation,
      stressSignals: signals,
    };
    setResult(runDeterministicSimulation(scenario));
  }

  function exportReport() {
    if (!result) return;
    const report = createSimulationExportReport({ result });
    setLastExportReport(report);
    setLastExportAt(report.metadata.exportedAt);
    const filename = `simulation-report-${result.scenario.preset}-${result.scenario.durationMinutes}m-${result.scenario.deterministicSeed}.json`;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function refreshSentryHealth() {
    try {
      const response = await fetch("/api/health/sentry");
      const data = await response.json();
      if (!response.ok) return;
      setSentryHealth(data);
    } catch {
      // non-blocking health check
    }
  }

  async function refreshDeploymentReadiness() {
    try {
      const response = await fetch("/api/health/deployment-readiness");
      const data = await response.json();
      if (!response.ok) return;
      setDeploymentReadiness(data);
    } catch {
      // non-blocking diagnostics
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshSentryHealth();
      void refreshDeploymentReadiness();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const performanceState = useMemo(() => {
    const visible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    const connection = typeof navigator !== "undefined"
      ? (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection
      : undefined;
    const polling = getAdaptivePollingOptimization({
      visible,
      online,
      saveData: connection?.saveData ?? false,
      effectiveType: connection?.effectiveType ?? "4g",
      baseIntervalMs: 9000,
    });
    const network = getNetworkEfficiencyMetrics({
      online,
      effectiveType: connection?.effectiveType ?? "4g",
      saveData: connection?.saveData ?? false,
      failureCount: 0,
      requestCount: 1,
    });
    return evaluateRuntimePerformanceState({
      polling,
      network,
      renderCountEstimate: result ? Math.max(12, Math.floor(result.points.length / 12)) : 8,
    });
  }, [result]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-lux-gradient bg-[length:200%_200%] animate-gradient-shift opacity-90" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_10%,rgba(168,85,247,0.2),transparent_40%),radial-gradient(circle_at_82%_15%,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(147,51,234,0.16),transparent_40%)]" />

      <section className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 md:px-6 md:py-8">
        <header className="glass-panel rounded-2xl p-4 md:p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-purple-200">Internal Toolkit</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Real Event Simulation</h1>
          <p className="mt-1 text-sm text-white/70">
            Deterministic stress simulation for long sessions. This page is isolated from production operator flow.
          </p>
        </header>

        <article className="glass-panel rounded-2xl p-4 md:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Preset</p>
              <select
                value={preset}
                onChange={(event) => applyPreset(event.target.value as SimulationPreset)}
                className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-sm"
              >
                {PRESET_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Duration</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setDuration(option.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                      duration === option.id
                        ? "border-purple-300/40 bg-purple-500/10 text-purple-100"
                        : "border-white/20 hover:bg-white/10"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Seed</p>
              <input
                type="number"
                value={seed}
                onChange={(event) => setSeed(Number(event.target.value || 42))}
                className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm"
              />
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Playback Mutation</p>
              <button
                onClick={() => setAllowPlaybackMutation((v) => !v)}
                className={`mt-2 w-full rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
                  allowPlaybackMutation
                    ? "border-red-300/40 bg-red-500/10 text-red-100"
                    : "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                {allowPlaybackMutation ? "Enabled (unsafe)" : "Disabled (safe default)"}
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {signals.map((signal) => (
              <div key={signal.type} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-widest text-white/60">{SIGNAL_LABELS[signal.type]}</p>
                  <button
                    onClick={() => updateSignal(signal.type, { enabled: !signal.enabled })}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${
                      signal.enabled
                        ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
                        : "border-white/20 text-white/70"
                    }`}
                  >
                    {signal.enabled ? "On" : "Off"}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(signal.intensity * 100)}
                  onChange={(event) =>
                    updateSignal(signal.type, {
                      intensity: Number(event.target.value) / 100,
                    })
                  }
                  className="mt-2 w-full"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={runSimulation}
              className="min-h-11 rounded-xl border border-purple-300/40 bg-purple-500/10 px-4 text-sm font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/20"
            >
              Run Simulation
            </button>
            <button
              onClick={() => setResult(null)}
              className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Clear
            </button>
            <button
              onClick={exportReport}
              disabled={!result}
              className="min-h-11 rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 text-sm font-semibold uppercase tracking-wider text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Export Report
            </button>
            <button
              onClick={() => void refreshSentryHealth()}
              className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Sentry Status
            </button>
            <button
              onClick={() => void refreshDeploymentReadiness()}
              className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Deployment Readiness
            </button>
          </div>

          {sentryHealth ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
              <p className="text-xs uppercase tracking-widest text-white/60">Monitoring Readiness</p>
              <p className="mt-1">
                Sentry: {sentryHealth.sentryEnabled ? "enabled" : "disabled"} | Runtime:{" "}
                {sentryHealth.runtimeReady ? "ready" : "not ready"} | Traces:{" "}
                {sentryHealth.tracesEnabled ? "on" : "off"}
              </p>
              {sentryHealth.configWarnings.length > 0 ? (
                <p className="mt-1 text-amber-200">
                  {sentryHealth.configWarnings.slice(0, 2).join(" | ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {deploymentReadiness ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
              <p className="text-xs uppercase tracking-widest text-white/60">Deployment Readiness</p>
              <p className="mt-1">
                Overall:{" "}
                <span className={deploymentReadiness.ready ? "text-emerald-100" : "text-amber-100"}>
                  {deploymentReadiness.ready ? "ready" : "needs attention"}
                </span>{" "}
                | Build: {deploymentReadiness.buildValidation.buildCompatible ? "ok" : "check"} | Runtime:{" "}
                {deploymentReadiness.buildValidation.runtimeCompatible ? "ok" : "check"} | Hydration:{" "}
                {deploymentReadiness.buildValidation.hydrationSafe ? "ok" : "check"}
              </p>
              {deploymentReadiness.issues.length > 0 ? (
                <p className="mt-1 text-amber-200">
                  {deploymentReadiness.issues.slice(0, 2).map((issue) => issue.message).join(" | ")}
                </p>
              ) : null}
              {deploymentReadiness.warnings.length > 0 ? (
                <p className="mt-1 text-white/65">
                  {deploymentReadiness.warnings.slice(0, 2).join(" | ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
            <p className="text-xs uppercase tracking-widest text-white/60">Runtime Performance</p>
            <p className="mt-1">
              Polling: {performanceState.polling.pollingIntensity} ({performanceState.polling.recommendedIntervalMs}ms) | Render load:{" "}
              {performanceState.renderLoad} | Battery mode: {performanceState.polling.batteryFriendlyMode ? "on" : "off"}
            </p>
            <p className="mt-1">
              Network: {performanceState.network.effectiveType} | Retry spacing: {performanceState.network.retrySpacingMs}ms
            </p>
          </div>
        </article>

        {result ? (
          <article className="glass-panel rounded-2xl p-4 md:p-5">
            <h2 className="text-lg font-semibold">Simulation Snapshot</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Metric label="Runtime Health" value={`${latestHealth.toFixed(1)}%`} tone={statusColor(latestHealth)} />
              <Metric
                label="AI Confidence"
                value={`${latestConfidence.toFixed(1)}%`}
                tone={statusColor(latestConfidence)}
              />
              <Metric
                label="Recovery Success"
                value={`${result.recovery.recoverySuccessRate.toFixed(1)}%`}
                tone={statusColor(result.recovery.recoverySuccessRate)}
              />
              <Metric label="Desync Incidents" value={`${result.recovery.desyncIncidents}`} />
              <Metric label="Reconnect Incidents" value={`${result.recovery.reconnectIncidents}`} />
              <Metric label="Operator Overrides" value={`${result.recovery.operatorOverrideCount}`} />
              <Metric label="Stale States" value={`${result.recovery.staleIncidents}`} />
              <Metric label="Queue Exhaustions" value={`${result.recovery.queueExhaustionIncidents}`} />
              <Metric label="Recovery Attempts" value={`${result.recovery.recoveryAttempts}`} />
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
              <p className="text-xs uppercase tracking-widest text-white/60">Runtime Health Over Time</p>
              <p className="mt-2 text-xs leading-relaxed">{healthSeries || "No series yet."}</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
                <p className="text-xs uppercase tracking-widest text-white/60">Recent Runtime Events</p>
                <ul className="mt-2 space-y-1">
                  {result.events.slice(-8).map((event) => (
                    <li key={event.id}>
                      m{event.minute} | {event.type.replaceAll("_", " ")} | {event.severity} | {event.recovered ? "recovered" : "active"}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
                <p className="text-xs uppercase tracking-widest text-white/60">Warnings</p>
                <ul className="mt-2 space-y-1">
                  {(result.warnings.length ? result.warnings : ["No major warnings."]).map((warning) => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              </div>
            </div>

            {lastExportReport ? (
              <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                <p className="text-xs uppercase tracking-widest text-emerald-200/80">Export Summary</p>
                <p className="mt-1">
                  Last export:{" "}
                  <span className="font-semibold">
                    {lastExportAt ? new Date(lastExportAt).toLocaleString() : "n/a"}
                  </span>
                </p>
                <p className="mt-1">
                  Seed: {lastExportReport.seed} | Incidents:{" "}
                  {lastExportReport.reliabilityMetrics.totalIncidentCount} | Recovery rate:{" "}
                  {lastExportReport.recoveryOutcomes.recoverySuccessRate.toFixed(1)}%
                </p>
              </div>
            ) : null}
          </article>
        ) : null}
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-widest text-white/60">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

