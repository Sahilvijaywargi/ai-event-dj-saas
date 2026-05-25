import { createHash } from "node:crypto";
import {
  AdaptiveThresholdDiagnostics,
  evaluateAdaptiveDrift,
  ThresholdTriggerSource,
} from "@/lib/spotify/adaptive-thresholds";

export type RecommendationContextInput = {
  eventPhase: string | null;
  bpmLane: { min: number; max: number } | null;
  crowdMomentum: string | null;
  energy: number | null;
  queueSnapshotId: string | null;
};

export type NormalizedRecommendationContext = {
  eventPhase: string;
  bpmLaneBucket: string;
  crowdMomentumBucket: "low" | "steady" | "rising" | "surging";
  energyBucket: "very-low" | "low" | "medium" | "high" | "very-high";
  queueSnapshotId: string | null;
};

function normalizePhase(value: string | null) {
  if (!value?.trim()) return "social";
  return value.trim().toLowerCase();
}

function normalizeMomentum(value: string | null): NormalizedRecommendationContext["crowdMomentumBucket"] {
  const normalized = value?.toLowerCase();
  if (normalized === "low" || normalized === "steady" || normalized === "rising" || normalized === "surging") {
    return normalized;
  }
  return "steady";
}

function energyBucket(energy: number | null): NormalizedRecommendationContext["energyBucket"] {
  const safe = Math.max(1, Math.min(10, Math.round(energy ?? 5)));
  if (safe <= 2) return "very-low";
  if (safe <= 4) return "low";
  if (safe <= 6) return "medium";
  if (safe <= 8) return "high";
  return "very-high";
}

function normalizeBpmLane(bpmLane: { min: number; max: number } | null) {
  if (!bpmLane) return "110-120";
  const min = Math.round(Math.max(70, Math.min(180, bpmLane.min)));
  const max = Math.round(Math.max(min, Math.min(180, bpmLane.max)));
  const bucketMin = Math.floor(min / 5) * 5;
  const bucketMax = Math.ceil(max / 5) * 5;
  return `${bucketMin}-${bucketMax}`;
}

export function normalizeRecommendationContext(
  input: RecommendationContextInput,
): NormalizedRecommendationContext {
  return {
    eventPhase: normalizePhase(input.eventPhase),
    bpmLaneBucket: normalizeBpmLane(input.bpmLane),
    crowdMomentumBucket: normalizeMomentum(input.crowdMomentum),
    energyBucket: energyBucket(input.energy),
    queueSnapshotId: input.queueSnapshotId ?? null,
  };
}

export function recommendationContextHash(input: RecommendationContextInput) {
  const normalized = normalizeRecommendationContext(input);
  const serial = JSON.stringify(normalized);
  const hash = createHash("sha256").update(serial).digest("hex");
  return {
    normalized,
    hash,
  };
}

export type RecommendationInvalidationEvaluation = {
  invalidated: boolean;
  triggerSource: ThresholdTriggerSource;
  thresholdExceededReason: string | null;
  diagnostics: AdaptiveThresholdDiagnostics;
};

export function evaluateRecommendationInvalidation(params: {
  forceRefresh: boolean;
  hasCache: boolean;
  cacheExpired: boolean;
  queueSnapshotChanged: boolean;
  previousContext: NormalizedRecommendationContext | null;
  currentContext: NormalizedRecommendationContext;
  stalenessPercent: number;
}): RecommendationInvalidationEvaluation {
  const currentBpmParts = params.currentContext.bpmLaneBucket.split("-").map(Number);
  const previousBpmParts = params.previousContext?.bpmLaneBucket.split("-").map(Number) ?? null;
  const diagnostics = evaluateAdaptiveDrift({
    previousBpmLane: previousBpmParts ? { min: previousBpmParts[0] ?? 110, max: previousBpmParts[1] ?? 120 } : null,
    currentBpmLane: { min: currentBpmParts[0] ?? 110, max: currentBpmParts[1] ?? 120 },
    previousMomentum: params.previousContext?.crowdMomentumBucket ?? null,
    currentMomentum: params.currentContext.crowdMomentumBucket,
    previousEnergy:
      params.previousContext?.energyBucket === "very-low"
        ? 2
        : params.previousContext?.energyBucket === "low"
          ? 4
          : params.previousContext?.energyBucket === "medium"
            ? 6
            : params.previousContext?.energyBucket === "high"
              ? 8
              : 9,
    currentEnergy:
      params.currentContext.energyBucket === "very-low"
        ? 2
        : params.currentContext.energyBucket === "low"
          ? 4
          : params.currentContext.energyBucket === "medium"
            ? 6
            : params.currentContext.energyBucket === "high"
              ? 8
              : 9,
    previousPhase: params.previousContext?.eventPhase ?? null,
    currentPhase: params.currentContext.eventPhase,
    stalenessPercent: params.stalenessPercent,
    queueSnapshotChanged: params.queueSnapshotChanged,
  });

  if (params.forceRefresh) {
    return {
      invalidated: true,
      triggerSource: "force_refresh",
      thresholdExceededReason: "force_refresh_requested",
      diagnostics,
    };
  }
  if (!params.hasCache) {
    return {
      invalidated: true,
      triggerSource: "cache_missing",
      thresholdExceededReason: "cache_missing",
      diagnostics,
    };
  }
  if (params.cacheExpired || diagnostics.exceeded.staleness) {
    return {
      invalidated: true,
      triggerSource: "cache_expired",
      thresholdExceededReason: "recommendation_stale",
      diagnostics,
    };
  }
  if (diagnostics.exceeded.snapshot) {
    return {
      invalidated: true,
      triggerSource: "queue_snapshot_change",
      thresholdExceededReason: "queue_snapshot_changed",
      diagnostics,
    };
  }
  if (diagnostics.exceeded.phase) {
    return {
      invalidated: true,
      triggerSource: "phase_change",
      thresholdExceededReason: "phase_transition_sensitivity_exceeded",
      diagnostics,
    };
  }
  if (diagnostics.exceeded.bpmLane) {
    return {
      invalidated: true,
      triggerSource: "bpm_lane_drift",
      thresholdExceededReason: "bpm_lane_drift_threshold_exceeded",
      diagnostics,
    };
  }
  if (diagnostics.exceeded.momentum) {
    return {
      invalidated: true,
      triggerSource: "momentum_drift",
      thresholdExceededReason: "momentum_drift_threshold_exceeded",
      diagnostics,
    };
  }
  if (diagnostics.exceeded.energy) {
    return {
      invalidated: true,
      triggerSource: "energy_drift",
      thresholdExceededReason: "energy_drift_threshold_exceeded",
      diagnostics,
    };
  }

  return {
    invalidated: false,
    triggerSource: "none",
    thresholdExceededReason: null,
    diagnostics,
  };
}

