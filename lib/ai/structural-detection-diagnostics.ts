import "server-only";

import {
  mapPhraseSectionToSongSection,
  mapPhraseWindowToSongSection,
  type SongSection,
} from "@/lib/ai/song-structure";

export type ClassificationMode = "audio_driven" | "mixed" | "position_driven";

export type SectionTransitionTrigger =
  | "position_threshold"
  | "phrase_window"
  | "audio_heuristic"
  | "initial";

export interface StructuralInferenceDebug {
  playbackProgressMs: number | null;
  phrasePosition: number | null;
  phraseWindow: string | null;
  currentPhraseSection: string | null;
  currentEnergy: number | null;
  energyTrend: number | null;
  tensionTrend: number | null;
  detectedSection: SongSection;
  inferenceReason: string[];
  classificationInputs: Record<string, string | number | boolean | null>;
}

export interface SectionTransitionEvent {
  timestampMs: number;
  previousSection: SongSection | null;
  detectedSection: SongSection;
  reason: string;
  trigger: SectionTransitionTrigger;
}

export interface PhraseAudioAgreement {
  phraseWindowPrediction: SongSection;
  audioEvidencePrediction: SongSection;
  agreementScore: number;
  disagreementReason: string | null;
}

export interface StructuralDetectionValidation {
  debug: StructuralInferenceDebug;
  sectionTransitionTimeline: SectionTransitionEvent[];
  positionDrivenConfidence: number;
  classificationMode: ClassificationMode;
  phraseAudioAgreement: PhraseAudioAgreement;
}

const POSITION_THRESHOLDS = [14, 34, 46, 54, 78] as const;

type TimelineState = {
  lastSection: SongSection | null;
  lastPhrasePosition: number | null;
  events: SectionTransitionEvent[];
};

const timelineStore = new Map<string, TimelineState>();
const MAX_TIMELINE_EVENTS = 32;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(clamp(value, 0, 100).toFixed(2));
}

export function derivePhraseWindowFromPosition(params: {
  phrasePosition: number;
  executionWindowState?: "stable_window" | "narrow_window" | "unstable_window" | "expired_window";
}): "intro" | "buildup" | "phrase_boundary" | "chorus" | "outro" | "unstable" {
  if (
    params.executionWindowState === "unstable_window" ||
    params.executionWindowState === "expired_window"
  ) {
    return "unstable";
  }
  const phrasePosition = clamp(params.phrasePosition, 0, 100);
  if (phrasePosition < 14) return "intro";
  if (phrasePosition < 34) return "buildup";
  if (phrasePosition >= 46 && phrasePosition <= 54) return "phrase_boundary";
  if (phrasePosition < 78) return "chorus";
  return "outro";
}

export function predictSectionFromPhrasePosition(params: {
  phrasePosition: number;
  executionWindowState?: "stable_window" | "narrow_window" | "unstable_window" | "expired_window";
}): { section: SongSection; phraseWindow: string; reasoning: string[] } {
  const phraseWindow = derivePhraseWindowFromPosition(params);
  const section = mapPhraseWindowToSongSection(phraseWindow);
  const band =
    params.phrasePosition < 14
      ? "0-14%"
      : params.phrasePosition < 34
        ? "14-34%"
        : params.phrasePosition <= 54
          ? params.phrasePosition < 46
            ? "34-46%"
            : "46-54%"
          : params.phrasePosition < 78
            ? "54-78%"
            : "78-100%";

  return {
    section,
    phraseWindow,
    reasoning: [
      `Position-only model maps ${params.phrasePosition.toFixed(1)}% (${band}) → window "${phraseWindow}" → section "${section}".`,
    ],
  };
}

export function predictSectionFromAudioEvidence(params: {
  derivedPhraseSection?: "intro" | "verse" | "buildup" | "drop" | "breakdown" | "bridge" | "outro";
  sessionEnergy?: number;
  roomEnergy?: number;
  energyTrend?: number;
  tensionTrend?: number;
  dropIntensity?: number;
  speechiness?: number;
  instrumentalness?: number;
  breakdownPresence?: boolean;
  phrasePosition?: number;
}): { section: SongSection; reasoning: string[] } {
  const reasoning: string[] = [];
  const energy = params.roomEnergy ?? params.sessionEnergy ?? 5;
  const energyTrend = params.energyTrend ?? 0;
  const tension = params.tensionTrend ?? 50;
  const phrasePosition = params.phrasePosition ?? 50;

  if (params.derivedPhraseSection) {
    const mapped = mapPhraseSectionToSongSection(params.derivedPhraseSection);
    reasoning.push(`Audio/metadata profile primary section: "${params.derivedPhraseSection}" → "${mapped}".`);
    if (
      params.dropIntensity != null &&
      params.dropIntensity >= 7.5 &&
      energy >= 6.5 &&
      mapped !== "drop"
    ) {
      reasoning.push("Drop intensity + energy override toward drop section.");
      return { section: "drop", reasoning };
    }
    if (energy <= 4.2 && phrasePosition >= 72 && mapped !== "outro") {
      reasoning.push("Low energy late in phrase suggests outro (audio evidence).");
      return { section: "outro", reasoning };
    }
    if (energyTrend <= -8 && tension < 45) {
      reasoning.push("Falling energy trend with low tension suggests breakdown.");
      return { section: "breakdown", reasoning };
    }
    if (energyTrend >= 10 && mapped === "verse") {
      reasoning.push("Rising energy trend elevates verse toward build.");
      return { section: "build", reasoning };
    }
    return { section: mapped, reasoning };
  }

  if (params.dropIntensity != null && params.dropIntensity >= 7.5 && energy >= 6.5) {
    reasoning.push("Drop intensity threshold met without phrase profile.");
    return { section: "drop", reasoning };
  }
  if (energy <= 4.5 && phrasePosition >= 70) {
    reasoning.push("Low energy + late phrase position → outro.");
    return { section: "outro", reasoning };
  }
  if (energy <= 5 && phrasePosition <= 18) {
    reasoning.push("Low energy + early phrase position → intro.");
    return { section: "intro", reasoning };
  }
  if (energy >= 8) {
    reasoning.push("High energy without profile → chorus.");
    return { section: "chorus", reasoning };
  }
  if (energy >= 6.5 && energyTrend >= 6) {
    reasoning.push("Moderate-high energy with positive trend → build.");
    return { section: "build", reasoning };
  }
  reasoning.push("Audio evidence inconclusive; defaulting to verse.");
  return { section: "verse", reasoning };
}

function sectionAgreementScore(a: SongSection, b: SongSection): number {
  if (a === b) return 100;
  const partialPairs: Array<[SongSection, SongSection]> = [
    ["verse", "pre_chorus"],
    ["pre_chorus", "chorus"],
    ["build", "drop"],
    ["breakdown", "build"],
    ["intro", "verse"],
    ["chorus", "drop"],
    ["build", "chorus"],
  ];
  if (partialPairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) {
    return 72;
  }
  if ((a === "outro" && b === "breakdown") || (a === "breakdown" && b === "outro")) return 58;
  return 42;
}

export function evaluatePhraseAudioAgreement(params: {
  phraseWindowPrediction: SongSection;
  audioEvidencePrediction: SongSection;
}): PhraseAudioAgreement {
  const agreementScore = sectionAgreementScore(
    params.phraseWindowPrediction,
    params.audioEvidencePrediction,
  );
  const disagreementReason =
    agreementScore >= 85
      ? null
      : `Phrase window implies "${params.phraseWindowPrediction}" but audio evidence implies "${params.audioEvidencePrediction}".`;

  return {
    phraseWindowPrediction: params.phraseWindowPrediction,
    audioEvidencePrediction: params.audioEvidencePrediction,
    agreementScore,
    disagreementReason,
  };
}

function crossedPositionThreshold(previous: number | null, current: number): boolean {
  if (previous == null) return false;
  return POSITION_THRESHOLDS.some(
    (threshold) =>
      (previous < threshold && current >= threshold) || (previous > threshold && current <= threshold),
  );
}

function inferTransitionTrigger(params: {
  previousPhrasePosition: number | null;
  phrasePosition: number;
  previousWindow: string | null;
  phraseWindow: string | null;
  positionPrediction: SongSection;
  audioPrediction: SongSection;
  finalSection: SongSection;
}): SectionTransitionTrigger {
  if (crossedPositionThreshold(params.previousPhrasePosition, params.phrasePosition)) {
    return "position_threshold";
  }
  if (params.previousWindow && params.phraseWindow && params.previousWindow !== params.phraseWindow) {
    return "phrase_window";
  }
  if (
    params.finalSection === params.audioPrediction &&
    params.finalSection !== params.positionPrediction
  ) {
    return "audio_heuristic";
  }
  return "phrase_window";
}

export function recordSectionTransition(params: {
  userId: string;
  detectedSection: SongSection;
  phrasePosition: number;
  phraseWindow: string | null;
  positionPrediction: SongSection;
  audioPrediction: SongSection;
  reason: string;
}): SectionTransitionEvent[] {
  const now = Date.now();
  const state = timelineStore.get(params.userId) ?? {
    lastSection: null,
    lastPhrasePosition: null,
    events: [],
  };

  let trigger: SectionTransitionTrigger = "initial";
  if (state.lastSection !== null && state.lastSection !== params.detectedSection) {
    trigger = inferTransitionTrigger({
      previousPhrasePosition: state.lastPhrasePosition,
      phrasePosition: params.phrasePosition,
      previousWindow: null,
      phraseWindow: params.phraseWindow,
      positionPrediction: params.positionPrediction,
      audioPrediction: params.audioPrediction,
      finalSection: params.detectedSection,
    });
    const event: SectionTransitionEvent = {
      timestampMs: now,
      previousSection: state.lastSection,
      detectedSection: params.detectedSection,
      reason: params.reason,
      trigger,
    };
    state.events = [event, ...state.events].slice(0, MAX_TIMELINE_EVENTS);
  } else if (state.lastSection === null) {
    const initialEvent: SectionTransitionEvent = {
      timestampMs: now,
      previousSection: null,
      detectedSection: params.detectedSection,
      reason: params.reason,
      trigger: "initial",
    };
    state.events = [initialEvent, ...state.events].slice(0, MAX_TIMELINE_EVENTS);
  }

  state.lastSection = params.detectedSection;
  state.lastPhrasePosition = params.phrasePosition;
  timelineStore.set(params.userId, state);
  return state.events;
}

export function getSectionTransitionTimeline(userId: string): SectionTransitionEvent[] {
  return timelineStore.get(userId)?.events ?? [];
}

export function computePositionDrivenConfidence(params: {
  phrasePosition: number;
  phraseWindowPrediction: SongSection;
  audioEvidencePrediction: SongSection;
  finalSection: SongSection;
  timeline: SectionTransitionEvent[];
}): number {
  let confidence = 0;

  if (params.phraseWindowPrediction === params.finalSection) confidence += 32;
  if (params.phraseWindowPrediction !== params.audioEvidencePrediction) confidence += 18;
  if (params.finalSection !== params.audioEvidencePrediction) confidence += 16;

  const nearThreshold = POSITION_THRESHOLDS.some(
    (threshold) => Math.abs(params.phrasePosition - threshold) <= 3,
  );
  if (nearThreshold) confidence += 14;

  const canonicalProgression: SongSection[] = ["intro", "build", "verse", "chorus", "outro"];
  const recentSections = params.timeline
    .slice(0, 6)
    .map((event) => event.detectedSection)
    .reverse();
  const followsCanonical = recentSections.every((section, index) => {
    if (index === 0) return true;
    const prev = recentSections[index - 1];
    const prevIdx = canonicalProgression.indexOf(prev);
    const idx = canonicalProgression.indexOf(section);
    return prevIdx >= 0 && idx >= 0 && idx >= prevIdx;
  });
  if (followsCanonical && recentSections.length >= 2) confidence += 12;

  const thresholdTransitions = params.timeline.filter(
    (event) => event.trigger === "position_threshold",
  ).length;
  const totalTransitions = params.timeline.filter((event) => event.trigger !== "initial").length;
  if (totalTransitions > 0) {
    confidence += (thresholdTransitions / totalTransitions) * 28;
  }

  return round(confidence);
}

export function resolveClassificationMode(positionDrivenConfidence: number): ClassificationMode {
  if (positionDrivenConfidence >= 72) return "position_driven";
  if (positionDrivenConfidence <= 38) return "audio_driven";
  return "mixed";
}

export function buildStructuralDetectionValidation(params: {
  userId: string;
  detectedSection: SongSection;
  playbackProgressMs: number | null;
  phrasePosition: number | null;
  phraseTransitionWindow: string | null;
  derivedCurrentPhraseSection: string | null;
  sessionEnergy?: number;
  roomEnergy?: number;
  energyTrend?: number;
  tensionTrend?: number;
  dropIntensity?: number;
  executionWindowState?: "stable_window" | "narrow_window" | "unstable_window" | "expired_window";
  inferenceReason: string[];
  classificationInputs: Record<string, string | number | boolean | null>;
}): StructuralDetectionValidation {
  const phrasePosition = params.phrasePosition ?? 50;
  const positionModel = predictSectionFromPhrasePosition({
    phrasePosition,
    executionWindowState: params.executionWindowState,
  });
  const audioModel = predictSectionFromAudioEvidence({
    derivedPhraseSection: params.derivedCurrentPhraseSection as
      | "intro"
      | "verse"
      | "buildup"
      | "drop"
      | "breakdown"
      | "bridge"
      | "outro"
      | undefined,
    sessionEnergy: params.sessionEnergy,
    roomEnergy: params.roomEnergy,
    energyTrend: params.energyTrend,
    tensionTrend: params.tensionTrend,
    dropIntensity: params.dropIntensity,
    phrasePosition,
  });

  const phraseAudioAgreement = evaluatePhraseAudioAgreement({
    phraseWindowPrediction: positionModel.section,
    audioEvidencePrediction: audioModel.section,
  });

  const timeline = recordSectionTransition({
    userId: params.userId,
    detectedSection: params.detectedSection,
    phrasePosition,
    phraseWindow: params.phraseTransitionWindow,
    positionPrediction: positionModel.section,
    audioPrediction: audioModel.section,
    reason:
      params.inferenceReason[0] ??
      `Section "${params.detectedSection}" detected at ${phrasePosition.toFixed(0)}% phrase progress.`,
  });

  const positionDrivenConfidence = computePositionDrivenConfidence({
    phrasePosition,
    phraseWindowPrediction: positionModel.section,
    audioEvidencePrediction: audioModel.section,
    finalSection: params.detectedSection,
    timeline,
  });

  const classificationMode = resolveClassificationMode(positionDrivenConfidence);

  const debug: StructuralInferenceDebug = {
    playbackProgressMs: params.playbackProgressMs,
    phrasePosition: params.phrasePosition,
    phraseWindow: params.phraseTransitionWindow,
    currentPhraseSection: params.derivedCurrentPhraseSection,
    currentEnergy: params.sessionEnergy ?? params.roomEnergy ?? null,
    energyTrend: params.energyTrend ?? null,
    tensionTrend: params.tensionTrend ?? null,
    detectedSection: params.detectedSection,
    inferenceReason: [
      ...params.inferenceReason,
      ...positionModel.reasoning,
      ...audioModel.reasoning,
      phraseAudioAgreement.disagreementReason ?? "Phrase window and audio evidence agree.",
      `Classification mode: ${classificationMode} (position-driven confidence ${positionDrivenConfidence.toFixed(0)}).`,
    ],
    classificationInputs: {
      ...params.classificationInputs,
      positionModelSection: positionModel.section,
      audioModelSection: audioModel.section,
      phraseWindowFromPosition: positionModel.phraseWindow,
      positionThresholds: POSITION_THRESHOLDS.join(","),
      agreementScore: phraseAudioAgreement.agreementScore,
    },
  };

  return {
    debug,
    sectionTransitionTimeline: timeline,
    positionDrivenConfidence,
    classificationMode,
    phraseAudioAgreement,
  };
}
