import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AudioEnergySnapshot = {
  id: string;
  user_id: string;
  session_id: string | null;
  energy_level: number;
  crowd_intensity: number;
  silence_detected: boolean;
  spike_detected: boolean;
  drift_score: number;
  created_at: string;
};

export type EnergyDriftAnalysis = {
  rollingAverage: number;
  shortTermAverage: number;
  driftScore: number;
  silenceDetected: boolean;
  spikeDetected: boolean;
};

export type CrowdEngagementEstimate = {
  engagementScore: number;
  danceFloorActivityProxy: number;
  crowdNoiseIntensity: number;
};

export type AudioEnvironmentState = {
  latest: AudioEnergySnapshot | null;
  drift: EnergyDriftAnalysis;
  engagement: CrowdEngagementEstimate;
  rollingTrend: number[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeDrift(samples: number[]) {
  const rollingAverage = average(samples);
  const shortTermSamples = samples.slice(0, Math.min(5, samples.length));
  const shortTermAverage = average(shortTermSamples);
  const driftScore = Number((shortTermAverage - rollingAverage).toFixed(2));
  const silenceDetected = shortTermAverage < 20;
  const spikeDetected = shortTermAverage - rollingAverage > 18;

  return {
    rollingAverage: Number(rollingAverage.toFixed(2)),
    shortTermAverage: Number(shortTermAverage.toFixed(2)),
    driftScore,
    silenceDetected,
    spikeDetected,
  } satisfies EnergyDriftAnalysis;
}

function computeEngagement(params: { energy: number; crowdIntensity: number; driftScore: number }) {
  const engagementScore = clamp(
    Number((params.energy * 0.45 + params.crowdIntensity * 0.45 + (params.driftScore + 50) * 0.1).toFixed(2)),
    0,
    100,
  );
  const danceFloorActivityProxy = clamp(
    Number((params.energy * 0.65 + params.crowdIntensity * 0.35).toFixed(2)),
    0,
    100,
  );
  return {
    engagementScore,
    danceFloorActivityProxy,
    crowdNoiseIntensity: params.crowdIntensity,
  } satisfies CrowdEngagementEstimate;
}

export async function ingestAudioEnergyEvent(params: {
  userId: string;
  sessionId?: string | null;
  energyLevel: number;
  crowdIntensity: number;
}) {
  const supabase = await createSupabaseServerClient();
  const existing = await getAudioEnvironmentState({
    userId: params.userId,
    sessionId: params.sessionId ?? undefined,
    limit: 40,
  });
  const allSamples = [params.energyLevel, ...existing.rollingTrend].slice(0, 40);
  const drift = computeDrift(allSamples);
  const { data, error } = await supabase
    .from("audio_energy_events")
    .insert({
      user_id: params.userId,
      session_id: params.sessionId ?? null,
      energy_level: clamp(params.energyLevel, 0, 100),
      crowd_intensity: clamp(params.crowdIntensity, 0, 100),
      silence_detected: drift.silenceDetected,
      spike_detected: drift.spikeDetected,
      drift_score: drift.driftScore,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AudioEnergySnapshot;
}

export async function getAudioEnvironmentState(params: {
  userId: string;
  sessionId?: string;
  limit?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const query = supabase
    .from("audio_energy_events")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 40);
  if (params.sessionId) query.eq("session_id", params.sessionId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AudioEnergySnapshot[];
  const latest = rows[0] ?? null;
  const energySeries = rows.map((row) => row.energy_level);
  const crowdSeries = rows.map((row) => row.crowd_intensity);
  const drift = computeDrift(energySeries);
  const engagement = computeEngagement({
    energy: latest?.energy_level ?? drift.shortTermAverage,
    crowdIntensity: latest?.crowd_intensity ?? average(crowdSeries),
    driftScore: drift.driftScore,
  });
  return {
    latest,
    drift,
    engagement,
    rollingTrend: energySeries,
  } satisfies AudioEnvironmentState;
}

