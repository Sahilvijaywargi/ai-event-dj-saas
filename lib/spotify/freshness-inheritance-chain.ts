import "server-only";

import type { FreshnessCoordinationResult } from "@/lib/spotify/telemetry-freshness-coordinator";

export interface FreshnessInheritanceChain {
  inheritedFromSession?: string;
  inheritedAt?: string;
  stabilizationSource:
    | "rollback_ready"
    | "verification_finalized"
    | "queue_prepared"
    | "simulation_refinement"
    | "prepare_window";
  freshnessVersion: number;
  continuityConfidence: number;
  inheritedHeartbeatAt?: string;
  inheritedVerificationConfidence?: number;
}

export function inheritFreshnessAcrossMutationLifecycle(params: {
  stabilizationSource: FreshnessInheritanceChain["stabilizationSource"];
  sessionId?: string;
  verificationConfidence?: number;
  rollbackIntegrity?: number;
  coordination?: FreshnessCoordinationResult | null;
  previousChain?: FreshnessInheritanceChain | null;
}): FreshnessInheritanceChain {
  const inheritedAt = new Date().toISOString();
  const coordinationBoost =
    params.coordination?.freshness === "healthy"
      ? 22
      : params.coordination?.freshness === "grace_window"
        ? 16
        : 0;
  const integrityBoost = clamp((params.rollbackIntegrity ?? 0) * 0.35, 0, 35);
  const verificationBoost = clamp((params.verificationConfidence ?? 0) * 0.25, 0, 25);
  const continuityConfidence = Number(
    clamp(48 + coordinationBoost + integrityBoost + verificationBoost, 0, 100).toFixed(2),
  );

  const chain: FreshnessInheritanceChain = {
    inheritedFromSession: params.sessionId ?? params.previousChain?.inheritedFromSession,
    inheritedAt,
    stabilizationSource: params.stabilizationSource,
    freshnessVersion: (params.previousChain?.freshnessVersion ?? 0) + 1,
    continuityConfidence,
    inheritedHeartbeatAt: inheritedAt,
    inheritedVerificationConfidence: params.verificationConfidence,
  };

  console.log("[CONVERGENCE] telemetry inheritance preserved", {
    source: params.stabilizationSource,
    freshnessVersion: chain.freshnessVersion,
    continuityConfidence: chain.continuityConfidence,
  });

  return chain;
}

export function freshnessInheritanceAllowsQueuePrep(params: {
  chain?: FreshnessInheritanceChain | null;
  coordination?: FreshnessCoordinationResult | null;
  verificationFinalized?: boolean;
}): boolean {
  if (params.coordination?.freshness === "expired") return false;
  if (!params.verificationFinalized && !params.chain) return false;
  const continuity = params.chain?.continuityConfidence ?? 0;
  const validSource =
    params.chain?.stabilizationSource === "rollback_ready" ||
    params.chain?.stabilizationSource === "verification_finalized" ||
    params.chain?.stabilizationSource === "queue_prepared" ||
    params.chain?.stabilizationSource === "prepare_window";
  return (
    validSource &&
    continuity >= 52 &&
    (params.coordination?.freshness === "healthy" || params.coordination?.freshness === "grace_window")
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
