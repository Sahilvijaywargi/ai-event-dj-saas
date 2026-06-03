import { NextResponse } from "next/server";
import { apiJsonError, apiUnauthorized } from "@/lib/api/json-route-response";
import { getPlaybackExecutionState } from "@/lib/spotify/playback-execution-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiUnauthorized();

    const state = getPlaybackExecutionState(user.id);
    return NextResponse.json(
      {
        ok: true,
        success: true,
        state,
        observability: {
          lifecycleState: state.observabilitySurface?.lifecycleState ?? "pending",
          verificationScore: state.observabilitySurface?.verificationScore ?? 0,
          rollbackConfidence: state.observabilitySurface?.rollbackConfidence ?? 0,
          heartbeatHealth: state.observabilitySurface?.heartbeatHealth ?? 0,
          graceState: state.observabilitySurface?.graceState ?? "inactive",
          degradationSeverity: state.observabilitySurface?.degradationSeverity ?? "none",
          executionHealthClassification:
            state.observabilitySurface?.executionHealthClassification ?? "stabilizing",
          latestAuditCount: state.observabilitySurface?.latestAuditCount ?? 0,
        },
        diagnostics: {
          executionHealthClassification: state.executionHealthClassification,
          degradationSeverity: state.degradationSeverity,
          executionStabilityScore: state.executionStabilityScore,
          transportIntegrityScore: state.transportIntegrityScore,
          mutationRecoverabilityScore: state.mutationRecoverabilityScore,
          lifecycleState: state.mutationLifecycle?.state ?? "pending",
          latestAuditCount: state.mutationAuditTrail?.length ?? 0,
          runtimeObservabilitySummary: state.runtimeObservabilitySummary?.slice(-5) ?? [],
          telemetryVersion: state.telemetryVersion ?? 0,
          telemetryUpdatedAt: state.telemetryUpdatedAt ?? 0,
          verificationSequence: state.verificationSequence ?? 0,
          verificationFinalized: state.verificationFinalized ?? false,
          rollbackIntegrity: state.rollbackIntegrity ?? state.rollbackIntegrityScore ?? 0,
          verificationConfidence: state.verificationConfidence ?? state.mutationVerificationConfidence ?? 0,
          rollbackVerificationStage: state.rollbackVerificationStage ?? "pending",
        },
      },
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return apiJsonError(error);
  }
}
