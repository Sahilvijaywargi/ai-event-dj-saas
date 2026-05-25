import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDeploymentReadinessStatus } from "@/lib/runtime/deployment-readiness";
import { getSessionRecoveryState } from "@/lib/runtime/session-recovery";
import { getRuntimeReliabilityState } from "@/lib/runtime/reliability";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import {
  evaluateRuntimePerformanceState,
  getAdaptivePollingOptimization,
  getNetworkEfficiencyMetrics,
} from "@/lib/runtime/performance";
import { createQaIncident, createRuntimeQaStatus } from "@/lib/runtime/qa";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const playbackState = await getPlaybackOrchestrationState(user.id).catch(() => null);
    const recoveryState = getSessionRecoveryState(user.id);
    const reliability = getRuntimeReliabilityState({
      userId: user.id,
      playbackSynced: Boolean(playbackState?.activeDevice && playbackState?.playbackState),
      staleSignal: recoveryState.staleSnapshot,
    });
    const deployment = getDeploymentReadinessStatus();
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
      renderCountEstimate: reliability.staleStateDetected ? 50 : 18,
    });

    const incidents = [];
    if (!playbackState?.activeDevice || !playbackState?.playbackState) {
      incidents.push(
        createQaIncident({
          severity: "high",
          category: "connectivity",
          marker: "incident",
          title: "Spotify connectivity not ready.",
          detail: "Playback device/state not fully synced.",
        }),
      );
    }
    if (reliability.reconnect.state === "failed") {
      incidents.push(
        createQaIncident({
          severity: "high",
          category: "recovery",
          marker: "incident",
          title: "Recovery validation failed.",
          detail: "Reconnect path reported failure.",
        }),
      );
    }
    if (reliability.heartbeat.stale) {
      incidents.push(
        createQaIncident({
          severity: "medium",
          category: "state",
          marker: "anomaly",
          title: "Session persistence stale marker.",
          detail: "Runtime heartbeat/session continuity requires refresh.",
        }),
      );
    }

    const status = createRuntimeQaStatus({
      deployment,
      reliability,
      performance,
      spotifyConnected: Boolean(playbackState?.activeDevice && playbackState?.playbackState),
      sessionPersistenceHealthy: recoveryState.recoverable && recoveryState.consistency.status !== "unrecoverable",
      simulationVerified: true,
      operatorFlowComplete: true,
      incidents,
    });

    const pillStatus: "ready" | "caution" | "blocked" =
      status.readiness.readyForBetaEvent && status.unresolvedIncidents <= 2
        ? "ready"
        : status.readiness.total >= 65
          ? "caution"
          : "blocked";

    return NextResponse.json({
      status: pillStatus,
      readinessPercent: status.readiness.total,
      unresolvedIncidents: status.unresolvedIncidents,
      summary: {
        deploymentReadiness: deployment.ready,
        runtimeReliability: reliability.connectionQuality,
        recoveryValidation: reliability.reconnect.state,
        performanceEfficiency: performance.renderLoad,
        sessionPersistenceHealth: recoveryState.consistency.status,
        spotifyConnectivityReady: Boolean(playbackState?.activeDevice && playbackState?.playbackState),
      },
      generatedAt: status.generatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "blocked",
        readinessPercent: 0,
        unresolvedIncidents: 1,
        summary: {
          deploymentReadiness: false,
          runtimeReliability: "degraded",
          recoveryValidation: "failed",
          performanceEfficiency: "high",
          sessionPersistenceHealth: "unrecoverable",
          spotifyConnectivityReady: false,
        },
        generatedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "QA readiness unavailable",
      },
      { status: 500 },
    );
  }
}

