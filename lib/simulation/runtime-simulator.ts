export type SimulationPreset =
  | "wedding_reception"
  | "house_party"
  | "chill_lounge"
  | "high_energy_dance_event";

export type SimulationStressSignalType =
  | "crowd_energy_fluctuation"
  | "spotify_reconnect_failure"
  | "stale_recommendations"
  | "operator_override"
  | "network_degradation"
  | "playback_desync"
  | "queue_exhaustion";

export type SimulationStressSignal = {
  type: SimulationStressSignalType;
  enabled: boolean;
  intensity: number; // 0..1
};

export type SimulationScenario = {
  preset: SimulationPreset;
  durationMinutes: 120 | 240 | 360;
  deterministicSeed: number;
  allowPlaybackMutation: boolean;
  stressSignals: SimulationStressSignal[];
};

export type SimulationRuntimeEvent = {
  id: string;
  minute: number;
  type: SimulationStressSignalType | "recovery";
  severity: "low" | "medium" | "high";
  message: string;
  runtimeHealth: number;
  aiConfidence: number;
  recovered: boolean;
};

export type SimulationRecoveryResult = {
  reconnectIncidents: number;
  desyncIncidents: number;
  staleIncidents: number;
  queueExhaustionIncidents: number;
  operatorOverrideCount: number;
  recoveryAttempts: number;
  successfulRecoveries: number;
  recoverySuccessRate: number;
};

export type SimulationPoint = {
  minute: number;
  runtimeHealth: number;
  crowdEnergy: number;
  aiConfidence: number;
};

export type SimulationRunResult = {
  scenario: SimulationScenario;
  points: SimulationPoint[];
  events: SimulationRuntimeEvent[];
  recovery: SimulationRecoveryResult;
  warnings: string[];
};

export type SimulationExportMetadata = {
  exportedAt: string;
  toolkitVersion: string;
  deterministicReplay: boolean;
  environment: "internal_simulation";
};

export type SimulationExportReport = {
  metadata: SimulationExportMetadata;
  seed: number;
  scenario: SimulationScenario;
  timeline: SimulationRuntimeEvent[];
  stressIncidents: {
    reconnectIncidents: number;
    desyncIncidents: number;
    staleIncidents: number;
    queueExhaustionIncidents: number;
    operatorOverrideCount: number;
  };
  recoveryOutcomes: SimulationRecoveryResult;
  reliabilityMetrics: {
    averageRuntimeHealth: number;
    minimumRuntimeHealth: number;
    averageCrowdEnergy: number;
    totalIncidentCount: number;
    totalRecoveryEvents: number;
  };
  aiConfidenceDegradation: {
    startConfidence: number;
    endConfidence: number;
    degradation: number;
    minimumConfidence: number;
  };
  queueExhaustionWarnings: string[];
  warnings: string[];
};

const PRESET_BASELINE: Record<
  SimulationPreset,
  {
    baseEnergy: number;
    baseHealth: number;
    baseConfidence: number;
    incidentBias: number;
  }
> = {
  wedding_reception: {
    baseEnergy: 6.2,
    baseHealth: 88,
    baseConfidence: 84,
    incidentBias: 0.85,
  },
  house_party: {
    baseEnergy: 7.4,
    baseHealth: 82,
    baseConfidence: 79,
    incidentBias: 1.05,
  },
  chill_lounge: {
    baseEnergy: 4.6,
    baseHealth: 91,
    baseConfidence: 86,
    incidentBias: 0.65,
  },
  high_energy_dance_event: {
    baseEnergy: 8.5,
    baseHealth: 78,
    baseConfidence: 74,
    incidentBias: 1.25,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function signalEnabled(scenario: SimulationScenario, type: SimulationStressSignalType) {
  return scenario.stressSignals.find((signal) => signal.type === type)?.enabled ?? false;
}

function signalIntensity(scenario: SimulationScenario, type: SimulationStressSignalType) {
  return scenario.stressSignals.find((signal) => signal.type === type)?.intensity ?? 0;
}

function eventSeverity(impact: number): "low" | "medium" | "high" {
  if (impact >= 0.7) return "high";
  if (impact >= 0.35) return "medium";
  return "low";
}

export function createScenarioFromPreset(params: {
  preset: SimulationPreset;
  durationMinutes: 120 | 240 | 360;
  seed?: number;
}) {
  return {
    preset: params.preset,
    durationMinutes: params.durationMinutes,
    deterministicSeed: params.seed ?? 42,
    allowPlaybackMutation: false,
    stressSignals: [
      { type: "crowd_energy_fluctuation", enabled: true, intensity: 0.6 },
      { type: "spotify_reconnect_failure", enabled: true, intensity: 0.45 },
      { type: "stale_recommendations", enabled: true, intensity: 0.5 },
      { type: "operator_override", enabled: true, intensity: 0.55 },
      { type: "network_degradation", enabled: true, intensity: 0.45 },
      { type: "playback_desync", enabled: true, intensity: 0.5 },
      { type: "queue_exhaustion", enabled: true, intensity: 0.35 },
    ],
  } satisfies SimulationScenario;
}

export function runDeterministicSimulation(scenario: SimulationScenario): SimulationRunResult {
  const rng = lcg(scenario.deterministicSeed);
  const base = PRESET_BASELINE[scenario.preset];
  const events: SimulationRuntimeEvent[] = [];
  const points: SimulationPoint[] = [];

  let health = base.baseHealth;
  let energy = base.baseEnergy;
  let confidence = base.baseConfidence;

  let reconnectIncidents = 0;
  let desyncIncidents = 0;
  let staleIncidents = 0;
  let queueExhaustionIncidents = 0;
  let operatorOverrideCount = 0;
  let recoveryAttempts = 0;
  let successfulRecoveries = 0;

  const warnings: string[] = [];

  for (let minute = 0; minute <= scenario.durationMinutes; minute += 1) {
    const pulse = rng();
    const drift = (rng() - 0.5) * 0.22;
    energy = clamp(energy + drift, 1, 10);

    const incidentWindow =
      base.incidentBias *
      (scenario.durationMinutes / 120) *
      (signalEnabled(scenario, "network_degradation") ? 1 + signalIntensity(scenario, "network_degradation") * 0.3 : 1);
    const minuteChance = pulse * incidentWindow;

    let incidentType: SimulationStressSignalType | null = null;
    if (minute > 0 && minuteChance > 0.94 && signalEnabled(scenario, "playback_desync")) {
      incidentType = "playback_desync";
      desyncIncidents += 1;
      health -= 6 + signalIntensity(scenario, "playback_desync") * 6;
      confidence -= 4.2;
    } else if (minute > 0 && minuteChance > 0.9 && signalEnabled(scenario, "spotify_reconnect_failure")) {
      incidentType = "spotify_reconnect_failure";
      reconnectIncidents += 1;
      health -= 7 + signalIntensity(scenario, "spotify_reconnect_failure") * 7;
      confidence -= 4.8;
    } else if (minute > 0 && minuteChance > 0.87 && signalEnabled(scenario, "stale_recommendations")) {
      incidentType = "stale_recommendations";
      staleIncidents += 1;
      health -= 4 + signalIntensity(scenario, "stale_recommendations") * 6;
      confidence -= 6.2;
    } else if (minute > 0 && minuteChance > 0.84 && signalEnabled(scenario, "operator_override")) {
      incidentType = "operator_override";
      operatorOverrideCount += 1;
      health -= 2.5;
      confidence -= 2.8;
    } else if (minute > scenario.durationMinutes * 0.65 && minuteChance > 0.8 && signalEnabled(scenario, "queue_exhaustion")) {
      incidentType = "queue_exhaustion";
      queueExhaustionIncidents += 1;
      health -= 5.8;
      confidence -= 5.4;
    }

    if (incidentType) {
      const impact = clamp((100 - health) / 100, 0.1, 1);
      events.push({
        id: `${minute}-${incidentType}`,
        minute,
        type: incidentType,
        severity: eventSeverity(impact),
        message: `Simulated ${incidentType.replaceAll("_", " ")} incident.`,
        runtimeHealth: Number(clamp(health, 0, 100).toFixed(2)),
        aiConfidence: Number(clamp(confidence, 0, 100).toFixed(2)),
        recovered: false,
      });

      recoveryAttempts += 1;
      const recoveryChance = clamp(
        0.78 - signalIntensity(scenario, incidentType) * 0.25 + (signalEnabled(scenario, "operator_override") ? 0.08 : 0),
        0.25,
        0.92,
      );
      const recovered = rng() <= recoveryChance;
      if (recovered) {
        successfulRecoveries += 1;
        health += 4.5;
        confidence += 3.5;
        events.push({
          id: `${minute}-${incidentType}-recovery`,
          minute,
          type: "recovery",
          severity: "low",
          message: `Recovery routine stabilized ${incidentType.replaceAll("_", " ")}.`,
          runtimeHealth: Number(clamp(health, 0, 100).toFixed(2)),
          aiConfidence: Number(clamp(confidence, 0, 100).toFixed(2)),
          recovered: true,
        });
      }
    }

    if (signalEnabled(scenario, "crowd_energy_fluctuation")) {
      energy = clamp(
        energy + (rng() - 0.5) * signalIntensity(scenario, "crowd_energy_fluctuation"),
        1,
        10,
      );
      confidence -= Math.abs((energy - base.baseEnergy) * 0.2);
    }

    health = clamp(health + 0.18, 0, 100);
    confidence = clamp(confidence + 0.09, 0, 100);

    points.push({
      minute,
      runtimeHealth: Number(health.toFixed(2)),
      crowdEnergy: Number(energy.toFixed(2)),
      aiConfidence: Number(confidence.toFixed(2)),
    });
  }

  if (queueExhaustionIncidents > 0) {
    warnings.push(`Queue exhaustion warnings triggered ${queueExhaustionIncidents} times.`);
  }
  if (desyncIncidents > reconnectIncidents) {
    warnings.push("Playback desync incidents exceeded reconnect incidents.");
  }
  if (successfulRecoveries < Math.max(1, Math.floor(recoveryAttempts * 0.55))) {
    warnings.push("Recovery success rate below target threshold.");
  }
  if (scenario.allowPlaybackMutation) {
    warnings.push("Playback mutation mode enabled; keep this disabled outside isolated testing.");
  }

  return {
    scenario,
    points,
    events: events.slice(-250),
    recovery: {
      reconnectIncidents,
      desyncIncidents,
      staleIncidents,
      queueExhaustionIncidents,
      operatorOverrideCount,
      recoveryAttempts,
      successfulRecoveries,
      recoverySuccessRate: recoveryAttempts
        ? Number(((successfulRecoveries / recoveryAttempts) * 100).toFixed(2))
        : 100,
    },
    warnings,
  };
}

export function createSimulationExportReport(params: { result: SimulationRunResult }) {
  const { result } = params;
  const healthValues = result.points.map((point) => point.runtimeHealth);
  const energyValues = result.points.map((point) => point.crowdEnergy);
  const confidenceValues = result.points.map((point) => point.aiConfidence);
  const averageRuntimeHealth = Number(
    (
      healthValues.reduce((acc, value) => acc + value, 0) / Math.max(healthValues.length, 1)
    ).toFixed(2),
  );
  const minimumRuntimeHealth = Number(Math.min(...healthValues, 100).toFixed(2));
  const averageCrowdEnergy = Number(
    (
      energyValues.reduce((acc, value) => acc + value, 0) / Math.max(energyValues.length, 1)
    ).toFixed(2),
  );
  const startConfidence = Number((confidenceValues[0] ?? 0).toFixed(2));
  const endConfidence = Number((confidenceValues[confidenceValues.length - 1] ?? 0).toFixed(2));
  const minimumConfidence = Number(Math.min(...confidenceValues, 100).toFixed(2));
  const degradation = Number((startConfidence - endConfidence).toFixed(2));

  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      toolkitVersion: "simulation-v1",
      deterministicReplay: true,
      environment: "internal_simulation",
    },
    seed: result.scenario.deterministicSeed,
    scenario: result.scenario,
    timeline: result.events,
    stressIncidents: {
      reconnectIncidents: result.recovery.reconnectIncidents,
      desyncIncidents: result.recovery.desyncIncidents,
      staleIncidents: result.recovery.staleIncidents,
      queueExhaustionIncidents: result.recovery.queueExhaustionIncidents,
      operatorOverrideCount: result.recovery.operatorOverrideCount,
    },
    recoveryOutcomes: result.recovery,
    reliabilityMetrics: {
      averageRuntimeHealth,
      minimumRuntimeHealth,
      averageCrowdEnergy,
      totalIncidentCount: result.events.filter((event) => event.type !== "recovery").length,
      totalRecoveryEvents: result.events.filter((event) => event.type === "recovery").length,
    },
    aiConfidenceDegradation: {
      startConfidence,
      endConfidence,
      degradation,
      minimumConfidence,
    },
    queueExhaustionWarnings: result.warnings.filter((warning) =>
      warning.toLowerCase().includes("queue exhaustion"),
    ),
    warnings: result.warnings,
  } satisfies SimulationExportReport;
}

