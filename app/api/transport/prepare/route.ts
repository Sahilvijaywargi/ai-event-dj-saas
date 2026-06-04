import { NextResponse } from "next/server";
import { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { RollbackSurvivabilityResult } from "@/lib/spotify/rollback-survivability-engine";
import type { TransportRecoveryAnalysis } from "@/lib/spotify/transport-recovery-engine";
import type { OrchestrationRefinementResult } from "@/lib/ai/orchestration-refinement-types";
import { buildExecutionRuntimeState } from "@/lib/transition-orchestration/execution-runtime-snapshot";
import { getPlaybackExecutionState } from "@/lib/spotify/playback-execution-engine";
import { createOrchestrationEvaluationState } from "@/lib/transition-orchestration/layer-state";
import { apiJsonError, apiUnauthorized } from "@/lib/api/json-route-response";
import { snapshotTransportRuntime } from "@/lib/spotify/transport-runtime-snapshot";
import {
  prepareTransportMutation,
  recoverPlaybackSynchronization,
} from "@/lib/spotify/transport-orchestrator";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  queueTrack?: boolean;
  recoveryMode?: boolean;
  /** Musical orchestration context for queue/window prep only — never recomputed here. */
  evaluation?: TransitionEvaluationResult;
  adaptiveRefinement?: OrchestrationRefinementResult | null;
};

export async function POST(request: Request) {
  console.log("[SYNC] transport prepare route invoked");
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("[SYNC ERROR] transport prepare unauthorized");
      return apiUnauthorized();
    }

    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch (error) {
      console.error("[SYNC ERROR] transport prepare body parse failed", error);
      body = {};
    }

    if (body.recoveryMode) {
      console.log("[SYNC] recovering playback synchronization (transport-only)");
      const recovery = await recoverPlaybackSynchronization({
        userId: user.id,
      });
      const transportRuntime = await snapshotTransportRuntime({
        userId: user.id,
        mutation: recovery,
        refreshHeartbeats: true,
      });
      console.log("[TRANSPORT] runtime recovery updated", {
        success: recovery.success,
        reconciliation: transportRuntime.runtimeReconciliationStatus,
        deviceSync: transportRuntime.deviceSyncHealth,
      });
      return NextResponse.json(
        {
          ok: recovery.success,
          success: recovery.success,
          stateOrigin: "transport_runtime" as const,
          recovery,
          transportRuntime,
          message: recovery.success
            ? "Transport synchronization recovered."
            : recovery.blockers.join(", ") || "Transport synchronization recovery failed.",
        },
        { status: recovery.success ? 200 : 409, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!body.evaluation) {
      return NextResponse.json(
        {
          message:
            "Orchestration evaluation required for transport preparation. Run Evaluate first — transport routes do not recompute musical intelligence.",
          stateOrigin: "transport_runtime",
        },
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log("[SYNC] preparing transport mutation window");
    const result = await prepareTransportMutation({
      userId: user.id,
      evaluation: body.evaluation,
      queueTrack: body.queueTrack ?? false,
      refinementContext: body.adaptiveRefinement
        ? {
            selectedCandidate: body.adaptiveRefinement.selectedCandidate,
            convergenceMetrics: body.adaptiveRefinement.convergenceMetrics,
          }
        : undefined,
    });
    const transportRuntime = await snapshotTransportRuntime({
      userId: user.id,
      mutation: result,
      refreshHeartbeats: true,
    });
    const playbackExecution = getPlaybackExecutionState(user.id);
    const executionRuntime = buildExecutionRuntimeState({
      mutationLifecycle: { state: playbackExecution.mutationState },
      executionHealthClassification: playbackExecution.executionHealthClassification,
      executionStabilityScore: playbackExecution.executionStabilityScore,
      transportIntegrityScore: playbackExecution.transportIntegrityScore,
      mutationVerification: {
        verificationScore: playbackExecution.mutationVerification?.verificationScore,
        verificationConfidence: playbackExecution.mutationVerification?.verificationConfidence,
      },
      rollbackAllowed: playbackExecution.rollbackAllowed,
      rollbackIntegrityScore: playbackExecution.rollbackIntegrityScore,
      rollbackConfidence: playbackExecution.rollbackConfidence,
      rollbackReadiness: playbackExecution.rollbackReadiness,
      rollbackSurvivability: playbackExecution.rollbackSurvivability,
      transportRecovery: playbackExecution.transportRecovery,
      mutationReliability: playbackExecution.mutationReliability,
      latestCheckpointId: playbackExecution.latestCheckpointId,
      mutationJournalSize: playbackExecution.mutationJournalSize,
      mutationHeartbeat: {
        mutationHealthScore: playbackExecution.mutationHealthScore,
      },
      degradationSeverity: playbackExecution.degradationSeverity,
      graceState: playbackExecution.graceState,
    });
    console.log("[TRANSPORT] transport mutation prepared", {
      success: result.success,
      mutationType: result.mutationType,
      blockers: result.blockers,
    });

    const validationData = result.data as
      | {
          executionValidation?: unknown;
          historicalTrust?: unknown;
          learningSignals?: unknown;
          runtimeTrustCalibration?: unknown;
          autonomyReadiness?: unknown;
          rollbackSurvivability?: unknown;
          transportRecovery?: unknown;
          latestCheckpointId?: string;
          mutationJournalSize?: number;
          mutationReliability?: number;
        }
      | undefined;

    const survivabilityEvaluation: TransitionEvaluationResult = validationData?.rollbackSurvivability
      ? {
          ...body.evaluation,
          rollbackReadiness: (validationData.rollbackSurvivability as RollbackSurvivabilityResult)
            .rollbackReadiness,
          rollbackSurvivability: validationData.rollbackSurvivability as RollbackSurvivabilityResult,
          transportRecovery: validationData.transportRecovery as TransportRecoveryAnalysis | undefined,
          mutationReliability: validationData.mutationReliability,
          latestCheckpointId: validationData.latestCheckpointId,
          mutationJournalSize: validationData.mutationJournalSize,
        }
      : body.evaluation;

    return NextResponse.json(
      {
        ok: result.success,
        success: result.success,
        stateOrigin: "transport_runtime" as const,
        result,
        transportRuntime,
        executionRuntime,
        orchestrationEvaluation: createOrchestrationEvaluationState(survivabilityEvaluation),
        rollbackSurvivability: validationData?.rollbackSurvivability ?? null,
        transportRecovery: validationData?.transportRecovery ?? null,
        latestCheckpointId: validationData?.latestCheckpointId ?? null,
        mutationJournalSize: validationData?.mutationJournalSize ?? null,
        mutationReliability: validationData?.mutationReliability ?? null,
        executionValidation: validationData?.executionValidation ?? null,
        historicalTrust: validationData?.historicalTrust ?? null,
        learningSignals: validationData?.learningSignals ?? null,
        runtimeTrustCalibration: validationData?.runtimeTrustCalibration ?? null,
        autonomyReadiness: validationData?.autonomyReadiness ?? null,
        message: result.success
          ? "Transport execution window prepared."
          : result.blockers.join(", ") || "Transport preparation blocked.",
      },
      { status: result.success ? 200 : 409, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[SYNC ERROR] transport prepare failed", error);
    return apiJsonError(error);
  }
}
