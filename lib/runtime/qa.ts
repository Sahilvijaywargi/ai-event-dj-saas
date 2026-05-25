import type { DeploymentReadinessStatus } from "@/lib/runtime/deployment-readiness";
import type { RuntimePerformanceState } from "@/lib/runtime/performance";
import type { RuntimeReliabilityState } from "@/lib/runtime/reliability";

export type QaChecklistItem = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
  area:
    | "runtime_health"
    | "spotify"
    | "recovery"
    | "performance"
    | "session_persistence"
    | "reliability"
    | "simulation"
    | "operator_flow";
};

export type QaIncident = {
  id: string;
  createdAt: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "connectivity" | "state" | "performance" | "recovery" | "operator";
  title: string;
  detail: string;
  resolved: boolean;
  marker: "incident" | "anomaly";
};

export type QaRecoveryTest = {
  id: string;
  label: string;
  action: "reconnect" | "resync" | "stale_state" | "offline_mode" | "queue_exhaustion";
  expectedOutcome: string;
  lastRunAt: string | null;
  lastResult: "pass" | "warn" | "fail" | "not_run";
};

export type QaReadinessScore = {
  total: number;
  breakdown: {
    deployment: number;
    stability: number;
    recovery: number;
    performance: number;
    operatorFlow: number;
  };
  readyForBetaEvent: boolean;
  recommendation: string;
};

export type RuntimeQaStatus = {
  generatedAt: string;
  readiness: QaReadinessScore;
  checklist: QaChecklistItem[];
  unresolvedIncidents: number;
  runtimeStabilitySummary: string;
  deploymentSummary: string;
  recoveryReliabilitySummary: string;
  performanceEfficiencySummary: string;
  operatorFlowSummary: string;
  sessionDurationRecommendations: string[];
};

export function buildQaChecklist(params: {
  deployment: DeploymentReadinessStatus | null;
  reliability: RuntimeReliabilityState | null;
  performance: RuntimePerformanceState | null;
  spotifyConnected: boolean;
  sessionPersistenceHealthy: boolean;
  simulationVerified: boolean;
  operatorFlowComplete: boolean;
}): QaChecklistItem[] {
  const deploymentReady = Boolean(params.deployment?.ready);
  const runtimeHealthy = params.reliability?.connectionQuality === "good";
  const recoveryHealthy =
    params.reliability?.reconnect.state !== "failed" && params.reliability?.spotifySyncHealth !== "desynced";
  const performanceHealthy =
    params.performance?.renderLoad !== "high" &&
    params.performance?.network.requestFailureRate !== undefined &&
    params.performance.network.requestFailureRate <= 0.25;
  const reliabilityHealthy = !params.reliability?.heartbeat.stale;

  return [
    {
      id: "runtime-health",
      label: "Runtime Health Checklist",
      status: runtimeHealthy ? "pass" : "warn",
      detail: runtimeHealthy ? "Heartbeat and connection quality are stable." : "Runtime health degraded; verify heartbeat.",
      area: "runtime_health",
    },
    {
      id: "spotify-connectivity",
      label: "Spotify Connectivity Validation",
      status: params.spotifyConnected ? "pass" : "fail",
      detail: params.spotifyConnected ? "Playback device and state are available." : "Spotify device/state not synced.",
      area: "spotify",
    },
    {
      id: "recovery-path",
      label: "Recovery-Path Validation",
      status: recoveryHealthy ? "pass" : "warn",
      detail: recoveryHealthy ? "Reconnect/resync paths are in a healthy state." : "Recovery path reports desync/failure.",
      area: "recovery",
    },
    {
      id: "polling-performance",
      label: "Polling and Performance Diagnostics",
      status: performanceHealthy ? "pass" : "warn",
      detail: performanceHealthy ? "Polling/render load are within beta-safe range." : "Performance pressure detected.",
      area: "performance",
    },
    {
      id: "session-persistence",
      label: "Session Persistence Validation",
      status: params.sessionPersistenceHealthy ? "pass" : "warn",
      detail: params.sessionPersistenceHealthy
        ? "Recovery snapshot and continuity look healthy."
        : "Snapshot consistency needs validation.",
      area: "session_persistence",
    },
    {
      id: "reliability-verify",
      label: "Reliability Verification",
      status: reliabilityHealthy ? "pass" : "warn",
      detail: reliabilityHealthy ? "Reliability heartbeat is fresh." : "Reliability heartbeat appears stale.",
      area: "reliability",
    },
    {
      id: "simulation-verify",
      label: "Simulation Verification",
      status: params.simulationVerified ? "pass" : "pending",
      detail: params.simulationVerified
        ? "Simulation toolkit has recent validation confirmation."
        : "Run simulation scenario before beta event.",
      area: "simulation",
    },
    {
      id: "operator-flow",
      label: "Operator-Flow Validation",
      status: params.operatorFlowComplete ? "pass" : "warn",
      detail: params.operatorFlowComplete ? "Operator controls and lock flow validated." : "Complete operator flow checklist.",
      area: "operator_flow",
    },
    {
      id: "deployment-readiness",
      label: "Deployment Readiness Summary",
      status: deploymentReady ? "pass" : "warn",
      detail: deploymentReady ? "Deployment readiness checks pass." : "Resolve deployment readiness warnings/issues.",
      area: "runtime_health",
    },
  ];
}

export function computeQaReadinessScore(params: {
  checklist: QaChecklistItem[];
  unresolvedIncidents: number;
  deploymentReady: boolean;
  reliability: RuntimeReliabilityState | null;
  performance: RuntimePerformanceState | null;
  operatorFlowComplete: boolean;
}): QaReadinessScore {
  const passCount = params.checklist.filter((item) => item.status === "pass").length;
  const failCount = params.checklist.filter((item) => item.status === "fail").length;
  const warnCount = params.checklist.filter((item) => item.status === "warn").length;
  const totalItems = Math.max(1, params.checklist.length);

  const qualityBase = (passCount / totalItems) * 100 - failCount * 6 - warnCount * 2;
  const incidentPenalty = Math.min(25, params.unresolvedIncidents * 4);
  const reconnectPenalty = params.reliability?.reconnect.state === "failed" ? 10 : 0;
  const perfPenalty = params.performance?.renderLoad === "high" ? 8 : 0;
  const deploymentPenalty = params.deploymentReady ? 0 : 8;
  const operatorPenalty = params.operatorFlowComplete ? 0 : 6;

  const total = Math.max(
    0,
    Math.min(100, Math.round(qualityBase - incidentPenalty - reconnectPenalty - perfPenalty - deploymentPenalty - operatorPenalty)),
  );

  const breakdown = {
    deployment: params.deploymentReady ? 92 : 68,
    stability: params.reliability?.connectionQuality === "good" ? 90 : 70,
    recovery:
      params.reliability?.reconnect.state === "failed" || params.reliability?.spotifySyncHealth === "desynced" ? 64 : 88,
    performance:
      params.performance?.renderLoad === "high" || (params.performance?.network.requestFailureRate ?? 0) > 0.25 ? 66 : 89,
    operatorFlow: params.operatorFlowComplete ? 90 : 72,
  };

  const readyForBetaEvent = total >= 82 && failCount === 0 && params.unresolvedIncidents <= 2;
  const recommendation = readyForBetaEvent
    ? "Ready for beta event. Keep reliability monitor active and run quick pre-show checks."
    : "Not beta-ready yet. Resolve critical checklist items and rerun recovery tests.";

  return { total, breakdown, readyForBetaEvent, recommendation };
}

export function buildSessionDurationRecommendations(params: {
  score: QaReadinessScore;
  reliability: RuntimeReliabilityState | null;
  performance: RuntimePerformanceState | null;
}): string[] {
  const recommendations: string[] = [];
  if (params.score.total >= 90) {
    recommendations.push("Stress test target: 4-6h supervised runtime session.");
  } else if (params.score.total >= 80) {
    recommendations.push("Stress test target: 3-4h runtime with one planned recovery drill.");
  } else {
    recommendations.push("Stress test target: 90-120m session before longer beta events.");
  }

  if (params.reliability?.heartbeat.stale) {
    recommendations.push("Keep operator console open to maintain heartbeat freshness during QA.");
  }
  if (params.performance?.polling.batteryFriendlyMode) {
    recommendations.push("Battery-friendly mode active; validate perceived responsiveness on mobile.");
  }
  if ((params.performance?.network.requestFailureRate ?? 0) > 0.2) {
    recommendations.push("Increase retry spacing and avoid rapid manual refresh actions.");
  }
  if (recommendations.length < 3) {
    recommendations.push("Run reconnect + resync quick actions at least once per QA session.");
  }
  return recommendations.slice(0, 4);
}

export function createRuntimeQaStatus(params: {
  deployment: DeploymentReadinessStatus | null;
  reliability: RuntimeReliabilityState | null;
  performance: RuntimePerformanceState | null;
  spotifyConnected: boolean;
  sessionPersistenceHealthy: boolean;
  simulationVerified: boolean;
  operatorFlowComplete: boolean;
  incidents: QaIncident[];
}): RuntimeQaStatus {
  const checklist = buildQaChecklist({
    deployment: params.deployment,
    reliability: params.reliability,
    performance: params.performance,
    spotifyConnected: params.spotifyConnected,
    sessionPersistenceHealthy: params.sessionPersistenceHealthy,
    simulationVerified: params.simulationVerified,
    operatorFlowComplete: params.operatorFlowComplete,
  });
  const unresolvedIncidents = params.incidents.filter((incident) => !incident.resolved).length;
  const readiness = computeQaReadinessScore({
    checklist,
    unresolvedIncidents,
    deploymentReady: Boolean(params.deployment?.ready),
    reliability: params.reliability,
    performance: params.performance,
    operatorFlowComplete: params.operatorFlowComplete,
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    checklist,
    unresolvedIncidents,
    deploymentSummary: params.deployment?.ready ? "Deployment readiness checks pass." : "Deployment readiness needs attention.",
    runtimeStabilitySummary:
      params.reliability?.connectionQuality === "good"
        ? "Runtime stability is healthy."
        : "Runtime stability is degraded; monitor reconnect and heartbeat.",
    recoveryReliabilitySummary:
      params.reliability?.reconnect.state === "failed"
        ? "Recovery reliability is at risk due to reconnect failures."
        : "Recovery reliability is operational.",
    performanceEfficiencySummary:
      params.performance?.renderLoad === "high"
        ? "Performance efficiency degraded; reduce refresh pressure."
        : "Performance efficiency is within QA thresholds.",
    operatorFlowSummary: params.operatorFlowComplete
      ? "Operator flow checklist is complete."
      : "Operator flow validation is incomplete.",
    sessionDurationRecommendations: buildSessionDurationRecommendations({
      score: readiness,
      reliability: params.reliability,
      performance: params.performance,
    }),
  };
}

export function createRecoveryTests(): QaRecoveryTest[] {
  return [
    {
      id: "qa-reconnect",
      label: "Reconnect Recovery Test",
      action: "reconnect",
      expectedOutcome: "Reconnect completes or returns actionable diagnostics.",
      lastRunAt: null,
      lastResult: "not_run",
    },
    {
      id: "qa-resync",
      label: "Playback Resync Test",
      action: "resync",
      expectedOutcome: "Playback sync health returns to synced.",
      lastRunAt: null,
      lastResult: "not_run",
    },
    {
      id: "qa-stale-state",
      label: "Stale-State Simulation",
      action: "stale_state",
      expectedOutcome: "Recovery state marks stale and surfaces recommendations.",
      lastRunAt: null,
      lastResult: "not_run",
    },
    {
      id: "qa-offline-mode",
      label: "Offline-Mode Simulation",
      action: "offline_mode",
      expectedOutcome: "Runtime enters degraded/offline-safe diagnostics mode.",
      lastRunAt: null,
      lastResult: "not_run",
    },
    {
      id: "qa-queue-exhaustion",
      label: "Queue Exhaustion Trigger",
      action: "queue_exhaustion",
      expectedOutcome: "Queue exhaustion is detected and surfaced as incident.",
      lastRunAt: null,
      lastResult: "not_run",
    },
  ];
}

export function createQaIncident(params: Omit<QaIncident, "id" | "createdAt" | "resolved">): QaIncident {
  return {
    ...params,
    id: `qa-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    resolved: false,
  };
}

