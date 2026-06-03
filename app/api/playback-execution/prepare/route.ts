import { NextResponse } from "next/server";
import { evaluateTransitionEngine, TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { loadQueueRecommendationsForUser } from "@/lib/ai/runtime-intelligence-coordinator";
import { apiJsonError, apiUnauthorized } from "@/lib/api/json-route-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prepareTrackQueue } from "@/lib/spotify/playback-execution-engine";

type Body = {
  evaluation?: TransitionEvaluationResult;
};

export async function POST(request: Request) {
  console.log("[SYNC] playback-execution prepare route invoked");
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("[SYNC ERROR] playback-execution prepare unauthorized");
      return apiUnauthorized();
    }

    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch (error) {
      console.error("[SYNC ERROR] playback-execution prepare body parse failed", error);
      body = {};
    }

    console.log("[SYNC] fetching playback evaluation for queue bootstrap");
    const evaluation =
      body.evaluation ??
      (await (async () => {
        const queueRecommendations = await loadQueueRecommendationsForUser(user.id);
        return evaluateTransitionEngine({
          userId: user.id,
          queueRecommendations,
          assistedAutonomousEnabled: true,
        });
      })());
    console.log("[SYNC] preparing track queue and rollback snapshot");
    const prepared = await prepareTrackQueue({
      userId: user.id,
      evaluation,
    });
    console.log("[SYNC] execution state updated", {
      blockers: prepared.blockers,
      lifecycleState: prepared.state.mutationLifecycle?.state ?? "pending",
      transportIntegrityScore: prepared.state.transportIntegrityScore ?? 0,
      rollbackAvailable: prepared.state.rollbackAvailable,
    });
    return NextResponse.json(
      {
        ok: prepared.blockers.length === 0,
        success: prepared.blockers.length === 0,
        evaluation,
        state: prepared.state,
        blockers: prepared.blockers,
        warnings: prepared.warnings,
        observability: {
          lifecycleState: prepared.state.observabilitySurface?.lifecycleState ?? "pending",
          verificationScore: prepared.state.observabilitySurface?.verificationScore ?? 0,
          rollbackConfidence: prepared.state.observabilitySurface?.rollbackConfidence ?? 0,
          heartbeatHealth: prepared.state.observabilitySurface?.heartbeatHealth ?? 0,
          graceState: prepared.state.observabilitySurface?.graceState ?? "inactive",
          degradationSeverity: prepared.state.observabilitySurface?.degradationSeverity ?? "none",
          executionHealthClassification:
            prepared.state.observabilitySurface?.executionHealthClassification ?? "stabilizing",
          latestAuditCount: prepared.state.observabilitySurface?.latestAuditCount ?? 0,
        },
        diagnostics: {
          executionHealthClassification: prepared.state.executionHealthClassification,
          degradationSeverity: prepared.state.degradationSeverity,
          executionStabilityScore: prepared.state.executionStabilityScore,
          transportIntegrityScore: prepared.state.transportIntegrityScore,
          mutationRecoverabilityScore: prepared.state.mutationRecoverabilityScore,
          lifecycleState: prepared.state.mutationLifecycle?.state ?? "pending",
          verificationScore: prepared.state.observabilitySurface?.verificationScore ?? 0,
          rollbackConfidence: prepared.state.observabilitySurface?.rollbackConfidence ?? 0,
          heartbeatHealth: prepared.state.observabilitySurface?.heartbeatHealth ?? 0,
          telemetryVersion: prepared.state.telemetryVersion ?? 0,
          telemetryUpdatedAt: prepared.state.telemetryUpdatedAt ?? 0,
          verificationSequence: prepared.state.verificationSequence ?? 0,
          verificationFinalized: prepared.state.verificationFinalized ?? false,
          rollbackIntegrity: prepared.state.rollbackIntegrity ?? prepared.state.rollbackIntegrityScore ?? 0,
          verificationConfidence:
            prepared.state.verificationConfidence ?? prepared.state.mutationVerificationConfidence ?? 0,
          rollbackVerificationStage: prepared.state.rollbackVerificationStage ?? "pending",
        },
      },
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[SYNC ERROR] playback-execution prepare failed", error);
    return apiJsonError(error);
  }
}
