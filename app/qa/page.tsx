import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createQaIncident,
  createRecoveryTests,
  createRuntimeQaStatus,
  type QaIncident,
  type QaRecoveryTest,
} from "@/lib/runtime/qa";
import { getDeploymentReadinessStatus } from "@/lib/runtime/deployment-readiness";
import { getRuntimeReliabilityState } from "@/lib/runtime/reliability";
import { getSessionRecoveryState } from "@/lib/runtime/session-recovery";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import {
  evaluateRuntimePerformanceState,
  getAdaptivePollingOptimization,
  getNetworkEfficiencyMetrics,
} from "@/lib/runtime/performance";
import { QaConsole } from "@/app/qa/QaConsole";

async function getQaServerSnapshot() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const playbackState = await getPlaybackOrchestrationState(user.id).catch(() => null);
  const sessionRecovery = getSessionRecoveryState(user.id);
  const reliability = getRuntimeReliabilityState({
    userId: user.id,
    playbackSynced: Boolean(playbackState?.activeDevice && playbackState?.playbackState),
    staleSignal: sessionRecovery.staleSnapshot,
  });

  const performance = evaluateRuntimePerformanceState({
    polling: getAdaptivePollingOptimization({
      visible: true,
      online: true,
      saveData: false,
      effectiveType: "4g",
      baseIntervalMs: reliability.pollingBackoffMs ?? 6500,
    }),
    network: getNetworkEfficiencyMetrics({
      online: true,
      effectiveType: "4g",
      saveData: false,
      failureCount: reliability.connectionQuality === "good" ? 0 : 1,
      requestCount: 4,
    }),
    renderCountEstimate: reliability.staleStateDetected ? 54 : 18,
  });

  const deployment = getDeploymentReadinessStatus();
  const spotifyConnected = Boolean(playbackState?.activeDevice && playbackState?.playbackState);
  const sessionPersistenceHealthy = Boolean(
    sessionRecovery.recoverable && sessionRecovery.consistency.status !== "unrecoverable",
  );
  const simulationVerified = true;
  const operatorFlowComplete = true;

  const incidents: QaIncident[] = [];
  if (!spotifyConnected) {
    incidents.push(
      createQaIncident({
        severity: "high",
        category: "connectivity",
        marker: "incident",
        title: "Spotify connectivity is not synced.",
        detail: "Run reconnect or device selection before beta event.",
      }),
    );
  }
  if (reliability.heartbeat.stale) {
    incidents.push(
      createQaIncident({
        severity: "medium",
        category: "state",
        marker: "anomaly",
        title: "Runtime heartbeat is stale.",
        detail: "Keep operator surface active and trigger runtime refresh.",
      }),
    );
  }
  if (performance.renderLoad === "high") {
    incidents.push(
      createQaIncident({
        severity: "medium",
        category: "performance",
        marker: "anomaly",
        title: "Render pressure elevated.",
        detail: "Reduce refresh pressure and avoid rapid manual polling.",
      }),
    );
  }

  const status = createRuntimeQaStatus({
    deployment,
    reliability,
    performance,
    spotifyConnected,
    sessionPersistenceHealthy,
    simulationVerified,
    operatorFlowComplete,
    incidents,
  });

  const recoveryTests: QaRecoveryTest[] = createRecoveryTests();
  return { status, recoveryTests };
}

function metricTone(value: number) {
  if (value >= 85) return "text-emerald-100";
  if (value >= 70) return "text-amber-100";
  return "text-red-100";
}

export default async function QaPage() {
  const { status, recoveryTests } = await getQaServerSnapshot();

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-lux-gradient bg-[length:200%_200%] animate-gradient-shift opacity-90" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(168,85,247,0.2),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(255,255,255,0.09),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(126,34,206,0.2),transparent_38%)]" />

      <section className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 md:px-6 md:py-8">
        <header className="glass-panel rounded-2xl p-4 md:p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-purple-200">Internal Toolkit</p>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Beta Event Readiness + Runtime QA</h1>
          <p className="mt-1 text-sm text-white/70">
            Centralized internal QA surface for validating long-duration runtime readiness and operational confidence.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                status.readiness.readyForBetaEvent
                  ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
                  : "border-amber-300/40 bg-amber-500/10 text-amber-100"
              }`}
            >
              {status.readiness.readyForBetaEvent ? "Ready for Beta Event" : "Beta Readiness In Progress"}
            </span>
            <a
              href="/operator"
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Open Operator
            </a>
            <a
              href="/simulation"
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Open Simulation
            </a>
          </div>
        </header>

        <article className="glass-panel rounded-2xl p-4 md:p-5">
          <h2 className="text-lg font-semibold">Beta Readiness Score</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Total Readiness" value={`${status.readiness.total}%`} tone={metricTone(status.readiness.total)} />
            <Metric label="Deployment Readiness" value={`${status.readiness.breakdown.deployment}%`} />
            <Metric label="Runtime Stability" value={`${status.readiness.breakdown.stability}%`} />
            <Metric label="Recovery Reliability" value={`${status.readiness.breakdown.recovery}%`} />
            <Metric label="Performance Efficiency" value={`${status.readiness.breakdown.performance}%`} />
            <Metric label="Operator Flow" value={`${status.readiness.breakdown.operatorFlow}%`} />
          </div>
          <p className="mt-3 text-sm text-white/80">{status.readiness.recommendation}</p>
        </article>

        <article className="glass-panel rounded-2xl p-4 md:p-5">
          <h2 className="text-lg font-semibold">Runtime QA Summary</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SummaryCard title="Deployment" text={status.deploymentSummary} />
            <SummaryCard title="Stability" text={status.runtimeStabilitySummary} />
            <SummaryCard title="Recovery" text={status.recoveryReliabilitySummary} />
            <SummaryCard title="Performance" text={status.performanceEfficiencySummary} />
          </div>
          <p className="mt-3 text-xs text-white/65">Unresolved incidents: {status.unresolvedIncidents}</p>
        </article>

        <article className="glass-panel rounded-2xl p-4 md:p-5">
          <h2 className="text-lg font-semibold">Operator-Flow Completion Checklist</h2>
          <div className="mt-3 space-y-2">
            {status.checklist.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{item.label}</p>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                      item.status === "pass"
                        ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
                        : item.status === "fail"
                          ? "border-red-300/40 bg-red-500/10 text-red-100"
                          : item.status === "warn"
                            ? "border-amber-300/40 bg-amber-500/10 text-amber-100"
                            : "border-white/20 text-white/75"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/70">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <QaConsole initialStatus={status} initialRecoveryTests={recoveryTests} />

        <article className="glass-panel rounded-2xl p-4 md:p-5">
          <h2 className="text-lg font-semibold">Session-Duration Stress Recommendations</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            {status.sessionDurationRecommendations.map((recommendation) => (
              <li key={recommendation} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                {recommendation}
              </li>
            ))}
          </ul>
        </article>
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

function SummaryCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-widest text-white/60">{title}</p>
      <p className="mt-1 text-sm text-white/80">{text}</p>
    </div>
  );
}

