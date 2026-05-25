export type RecommendationTelemetryLifecycle = "active" | "needs_refresh" | "expired";

export type RecommendationTelemetryItem = {
  eventPlanId: string;
  eventName: string;
  eventType: string;
  lifecycleState: RecommendationTelemetryLifecycle;
  invalidationStatus: "valid" | "invalidated";
  triggerSource:
    | "force_refresh"
    | "phase_change"
    | "bpm_lane_drift"
    | "momentum_drift"
    | "energy_drift"
    | "queue_snapshot_change"
    | "cache_expired"
    | "cache_missing"
    | "none";
  refreshReason: string | null;
  freshness: "fresh" | "stale" | "expired";
  cacheAgeSeconds: number;
  eventPhase: string | null;
  queueSnapshotId: string | null;
  recommendationContextHash: string | null;
  drift: {
    bpmLaneDriftPercent: number;
    momentumDrift: number;
    energyDriftPercent: number;
    stalenessPercent: number;
    phaseDistance: number;
  };
  thresholds: {
    bpmLaneDriftThresholdPercent: number;
    crowdMomentumDriftThreshold: number;
    energyDriftThresholdPercent: number;
    recommendationStalenessThresholdPercent: number;
    phaseTransitionSensitivity: number;
  };
};

export type RecommendationTelemetryResponse = {
  generatedAt: string;
  items: RecommendationTelemetryItem[];
};

