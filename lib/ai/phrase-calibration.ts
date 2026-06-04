import "server-only";

import type { SongSection } from "@/lib/ai/song-structure";

export interface PhraseCalibrationObservation {
  observationId: string;
  userId: string;
  trackName: string;
  playbackPositionMs: number;
  detectedSection: SongSection | string;
  humanObservedSection: SongSection | string;
  confidence: number;
  recordedAt: string;
  notes?: string;
}

const calibrationStore = new Map<string, PhraseCalibrationObservation[]>();
const MAX_OBSERVATIONS_PER_USER = 200;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function recordPhraseCalibrationObservation(params: {
  userId: string;
  trackName: string;
  playbackPositionMs: number;
  detectedSection: SongSection | string;
  humanObservedSection: SongSection | string;
  confidence: number;
  notes?: string;
}): PhraseCalibrationObservation {
  const observation: PhraseCalibrationObservation = {
    observationId: `cal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    trackName: params.trackName.trim() || "unknown_track",
    playbackPositionMs: Math.max(0, Math.round(params.playbackPositionMs)),
    detectedSection: params.detectedSection,
    humanObservedSection: params.humanObservedSection,
    confidence: Number(clamp(params.confidence, 0, 100).toFixed(2)),
    recordedAt: new Date().toISOString(),
    notes: params.notes,
  };

  const existing = calibrationStore.get(params.userId) ?? [];
  calibrationStore.set(params.userId, [observation, ...existing].slice(0, MAX_OBSERVATIONS_PER_USER));
  console.log("[PHRASE_CALIBRATION] observation recorded", {
    trackName: observation.trackName,
    detected: observation.detectedSection,
    human: observation.humanObservedSection,
  });
  return observation;
}

export function getPhraseCalibrationHistory(params: {
  userId: string;
  trackName?: string;
  limit?: number;
}): PhraseCalibrationObservation[] {
  const history = calibrationStore.get(params.userId) ?? [];
  const filtered = params.trackName
    ? history.filter((item) => item.trackName.toLowerCase() === params.trackName!.toLowerCase())
    : history;
  return filtered.slice(0, params.limit ?? 40);
}

export function summarizePhraseCalibration(userId: string) {
  const history = calibrationStore.get(userId) ?? [];
  if (!history.length) {
    return {
      totalObservations: 0,
      mismatchCount: 0,
      mismatchRate: 0,
      tracks: [] as string[],
      recentMismatches: [] as PhraseCalibrationObservation[],
    };
  }

  const mismatches = history.filter(
    (item) =>
      String(item.detectedSection).toLowerCase() !== String(item.humanObservedSection).toLowerCase(),
  );
  const tracks = [...new Set(history.map((item) => item.trackName))];

  return {
    totalObservations: history.length,
    mismatchCount: mismatches.length,
    mismatchRate: Number(((mismatches.length / history.length) * 100).toFixed(2)),
    tracks,
    recentMismatches: mismatches.slice(0, 8),
  };
}
