export const ADAPTIVE_DRIFT_THRESHOLDS = {
  bpmLaneDriftThresholdPercent: 0.12,
  crowdMomentumDriftThreshold: 1,
  energyDriftThresholdPercent: 0.15,
  recommendationStalenessThresholdPercent: 0.8,
  phaseTransitionSensitivity: 1,
} as const;

export type ThresholdTriggerSource =
  | "force_refresh"
  | "phase_change"
  | "bpm_lane_drift"
  | "momentum_drift"
  | "energy_drift"
  | "queue_snapshot_change"
  | "cache_expired"
  | "cache_missing"
  | "none";

export type AdaptiveThresholdDiagnostics = {
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
  exceeded: {
    bpmLane: boolean;
    momentum: boolean;
    energy: boolean;
    staleness: boolean;
    phase: boolean;
    snapshot: boolean;
  };
};

const momentumRank: Record<string, number> = {
  low: 0,
  steady: 1,
  rising: 2,
  surging: 3,
};

const phaseRank: Record<string, number> = {
  warmup: 0,
  social: 1,
  build: 2,
  peak: 3,
  cooldown: 4,
};

export function evaluateAdaptiveDrift(params: {
  previousBpmLane: { min: number; max: number } | null;
  currentBpmLane: { min: number; max: number } | null;
  previousMomentum: string | null;
  currentMomentum: string | null;
  previousEnergy: number | null;
  currentEnergy: number | null;
  previousPhase: string | null;
  currentPhase: string | null;
  stalenessPercent: number;
  queueSnapshotChanged: boolean;
}) {
  const previousBpmCenter = params.previousBpmLane
    ? (params.previousBpmLane.min + params.previousBpmLane.max) / 2
    : 115;
  const currentBpmCenter = params.currentBpmLane
    ? (params.currentBpmLane.min + params.currentBpmLane.max) / 2
    : 115;
  const bpmLaneDriftPercent = Math.abs(currentBpmCenter - previousBpmCenter) / Math.max(previousBpmCenter, 1);

  const previousMomentumRank = momentumRank[(params.previousMomentum ?? "steady").toLowerCase()] ?? 1;
  const currentMomentumRank = momentumRank[(params.currentMomentum ?? "steady").toLowerCase()] ?? 1;
  const momentumDrift = Math.abs(currentMomentumRank - previousMomentumRank);

  const previousEnergy = Math.max(1, Math.min(10, params.previousEnergy ?? 5));
  const currentEnergy = Math.max(1, Math.min(10, params.currentEnergy ?? 5));
  const energyDriftPercent = Math.abs(currentEnergy - previousEnergy) / previousEnergy;

  const previousPhaseRank = phaseRank[(params.previousPhase ?? "social").toLowerCase()] ?? 1;
  const currentPhaseRank = phaseRank[(params.currentPhase ?? "social").toLowerCase()] ?? 1;
  const phaseDistance = Math.abs(currentPhaseRank - previousPhaseRank);

  const thresholds = ADAPTIVE_DRIFT_THRESHOLDS;
  const exceeded = {
    bpmLane: bpmLaneDriftPercent >= thresholds.bpmLaneDriftThresholdPercent,
    momentum: momentumDrift >= thresholds.crowdMomentumDriftThreshold,
    energy: energyDriftPercent >= thresholds.energyDriftThresholdPercent,
    staleness: params.stalenessPercent >= thresholds.recommendationStalenessThresholdPercent,
    phase: phaseDistance >= thresholds.phaseTransitionSensitivity,
    snapshot: params.queueSnapshotChanged,
  };

  const diagnostics: AdaptiveThresholdDiagnostics = {
    drift: {
      bpmLaneDriftPercent: Number((bpmLaneDriftPercent * 100).toFixed(2)),
      momentumDrift,
      energyDriftPercent: Number((energyDriftPercent * 100).toFixed(2)),
      stalenessPercent: Number((params.stalenessPercent * 100).toFixed(2)),
      phaseDistance,
    },
    thresholds: {
      bpmLaneDriftThresholdPercent: Number((thresholds.bpmLaneDriftThresholdPercent * 100).toFixed(2)),
      crowdMomentumDriftThreshold: thresholds.crowdMomentumDriftThreshold,
      energyDriftThresholdPercent: Number((thresholds.energyDriftThresholdPercent * 100).toFixed(2)),
      recommendationStalenessThresholdPercent: Number(
        (thresholds.recommendationStalenessThresholdPercent * 100).toFixed(2),
      ),
      phaseTransitionSensitivity: thresholds.phaseTransitionSensitivity,
    },
    exceeded,
  };

  return diagnostics;
}

