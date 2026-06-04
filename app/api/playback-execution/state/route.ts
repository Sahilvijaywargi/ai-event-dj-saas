import { NextResponse } from "next/server";
import { apiJsonError } from "@/lib/api/json-route-response";
import { resolveApiRouteAuth } from "@/lib/api/resolve-route-auth";
import { getPlaybackExecutionState } from "@/lib/spotify/playback-execution-engine";

export async function GET() {
  try {
    const auth = await resolveApiRouteAuth();
    if (!auth.ok) {
      console.warn("[API AUTH] playback-execution/state", {
        kind: auth.kind,
        diagnostics: auth.diagnostics,
      });
      return auth.response;
    }

    const state = getPlaybackExecutionState(auth.user.id);
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
