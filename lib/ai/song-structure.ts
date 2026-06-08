import "server-only";

import {
  evaluateStructuralNarrativeContinuity,
  type NarrativeContinuityAnalysis,
} from "@/lib/ai/narrative-continuity";
import {
  buildStructuralDetectionValidation,
  type ClassificationMode,
  type PhraseAudioAgreement,
  type SectionTransitionEvent,
  type StructuralInferenceDebug,
} from "@/lib/ai/structural-detection-diagnostics";
import { summarizePhraseCalibration } from "@/lib/ai/phrase-calibration";
import { resolveSectionClassification } from "@/lib/ai/structural-detection-diagnostics";
import {
  evaluateStructuralAgreement,
  type StructuralAgreementResult,
  type StructuralSection,
} from "@/lib/ai/structural-agreement";
import {
  resolveStructuralArbitration,
  type StructuralArbitrationResult,
} from "@/lib/ai/structural-arbitration";

export type SongSection =
  | "intro"
  | "verse"
  | "pre_chorus"
  | "chorus"
  | "breakdown"
  | "build"
  | "drop"
  | "outro"
  | "unknown";

export interface SongStructurePosition {
  currentSection: SongSection;
  nextSection?: SongSection;
  remainingBarsInSection: number;
  sectionConfidence: number;
}

export interface ExitSectionAnalysis {
  exitSection: SongSection;
  exitQuality: number;
  reasoning: string[];
}

export interface EntrySectionAnalysis {
  entrySection: SongSection;
  entryQuality: number;
  reasoning: string[];
}

export type StructuralInferenceSource = "live_telemetry" | "candidate_static" | "mixed_fallback";

export interface StructuralInferenceDiagnostics {
  inferenceSource: StructuralInferenceSource;
  sectionConfidence: number;
  playbackProgressMs: number | null;
  phrasePosition: number | null;
  phraseLengthBars: number | null;
  phraseTransitionWindow: string | null;
  derivedCurrentPhraseSection: string | null;
  candidatePhraseSection: string | null;
  candidatePhraseCompatibility: string | null;
  inferenceReason: string[];
  debug: StructuralInferenceDebug;
  sectionTransitionTimeline: SectionTransitionEvent[];
  positionDrivenConfidence: number;
  classificationMode: ClassificationMode;
  phraseAudioAgreement: PhraseAudioAgreement;
  structuralArbitration: StructuralArbitrationResult;
  calibrationSummary?: {
    totalObservations: number;
    mismatchRate: number;
    tracks: string[];
  };
}

export interface StructuralCompatibilityAnalysis {
  phraseLock: number;
  exitQuality: number;
  entryQuality: number;
  narrativeContinuity: number;
  structuralCompatibility: number;
  structuralConfidence: number;
  narrativeConfidence: number;
  converged: boolean;
  structuralAgreement: StructuralAgreementResult;
  structuralConfidenceReasoning: string[];
  reasoning: string[];
  exitSection: SongSection;
  entrySection: SongSection;
  narrativeContinuityLabel: NarrativeContinuityAnalysis["continuity"];
  inference: StructuralInferenceDiagnostics;
}

const EXIT_QUALITY: Record<SongSection, number> = {
  outro: 96,
  breakdown: 88,
  build: 78,
  verse: 62,
  pre_chorus: 58,
  intro: 52,
  chorus: 44,
  drop: 28,
  unknown: 40,
};

const ENTRY_QUALITY: Record<SongSection, number> = {
  intro: 96,
  breakdown: 88,
  build: 78,
  verse: 62,
  pre_chorus: 58,
  chorus: 44,
  drop: 28,
  outro: 36,
  unknown: 40,
};

const NEXT_SECTION_HINT: Partial<Record<SongSection, SongSection>> = {
  intro: "verse",
  verse: "pre_chorus",
  pre_chorus: "chorus",
  chorus: "breakdown",
  breakdown: "build",
  build: "drop",
  drop: "breakdown",
  outro: "unknown",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(clamp(value, 0, 100).toFixed(2));
}

export function mapPhraseWindowToSongSection(
  window: "intro" | "buildup" | "phrase_boundary" | "chorus" | "outro" | "unstable",
): SongSection {
  if (window === "intro") return "intro";
  if (window === "buildup") return "build";
  if (window === "chorus") return "chorus";
  if (window === "outro") return "outro";
  if (window === "phrase_boundary") return "verse";
  if (window === "unstable") return "breakdown";
  return "unknown";
}

export function mapPhraseSectionToSongSection(
  section: "intro" | "verse" | "buildup" | "drop" | "breakdown" | "bridge" | "outro",
): SongSection {
  if (section === "buildup") return "build";
  if (section === "bridge") return "breakdown";
  return section;
}

export function mapSongSectionToStructuralSection(section: SongSection): StructuralSection {
  if (section === "pre_chorus") return "build";
  if (section === "build") return "build";
  if (section === "drop") return "drop";
  if (section === "breakdown") return "breakdown";
  if (section === "intro") return "intro";
  if (section === "verse") return "verse";
  if (section === "chorus") return "chorus";
  if (section === "outro") return "outro";
  return "unknown";
}

export function computeStructuralConfidence(params: {
  agreementScore: number;
  sectionConfidence: number;
  phraseAlignment: number;
}): number {
  return round(
    params.agreementScore * 0.5 + params.sectionConfidence * 0.3 + params.phraseAlignment * 0.2,
  );
}

export function computeNarrativeConfidence(params: {
  structuralConfidence: number;
  narrativeContinuity: number;
  journeyAlignment: number;
  resolutionConfidence: number;
}): { narrativeConfidence: number; reasoning: string[] } {
  const reasoning: string[] = [];
  let narrativeConfidence = round(
    params.structuralConfidence * 0.4 +
      params.narrativeContinuity * 0.25 +
      params.journeyAlignment * 0.2 +
      params.resolutionConfidence * 0.15,
  );

  if (params.structuralConfidence < 50) {
    narrativeConfidence = round(narrativeConfidence * 0.75);
    reasoning.push("Structural uncertainty degrades narrative trust.");
    reasoning.push("Narrative continuity confidence reduced.");
  }

  if (params.structuralConfidence < 50) {
    reasoning.push("Structural agreement weak.");
  }

  return { narrativeConfidence, reasoning };
}

export function applyStructuralNarrativeConfidence(params: {
  analysis: StructuralCompatibilityAnalysis;
  narrativeContinuity: number;
  journeyAlignment: number;
  resolutionConfidence: number;
}): StructuralCompatibilityAnalysis {
  const narrativeLayer = computeNarrativeConfidence({
    structuralConfidence: params.analysis.structuralConfidence,
    narrativeContinuity: params.narrativeContinuity,
    journeyAlignment: params.journeyAlignment,
    resolutionConfidence: params.resolutionConfidence,
  });

  return {
    ...params.analysis,
    narrativeConfidence: narrativeLayer.narrativeConfidence,
    structuralConfidenceReasoning: [
      ...params.analysis.structuralConfidenceReasoning,
      ...narrativeLayer.reasoning,
    ],
    reasoning: [...params.analysis.reasoning, ...narrativeLayer.reasoning.slice(0, 2)],
  };
}

export function applyEnergySectionOverrides(params: {
  currentSection: SongSection;
  sectionConfidence: number;
  phrasePosition: number;
  energy?: number;
  dropIntensity?: number;
  inferenceReason: string[];
}): {
  currentSection: SongSection;
  sectionConfidence: number;
  inferenceReason: string[];
} {
  let currentSection = params.currentSection;
  let sectionConfidence = params.sectionConfidence;
  const inferenceReason = [...params.inferenceReason];
  const phrasePosition = clamp(params.phrasePosition, 0, 100);

  if (
    params.dropIntensity != null &&
    params.dropIntensity >= 7.5 &&
    phrasePosition >= 35 &&
    phrasePosition <= 75
  ) {
    currentSection = "drop";
    sectionConfidence = Math.max(sectionConfidence, 68);
    inferenceReason.push("Drop intensity and mid-phrase progress indicate drop section.");
  } else if ((params.energy ?? 5) >= 8.2 && ["verse", "build", "pre_chorus"].includes(currentSection)) {
    currentSection = "chorus";
    sectionConfidence = Math.max(sectionConfidence, 64);
    inferenceReason.push("High room energy elevates section to chorus.");
  } else if ((params.energy ?? 5) <= 4.5 && phrasePosition >= 70) {
    currentSection = "outro";
    sectionConfidence = Math.max(sectionConfidence, 66);
    inferenceReason.push("Low energy late in phrase suggests outro exit.");
  } else if ((params.energy ?? 5) <= 5 && phrasePosition <= 18) {
    currentSection = "intro";
    sectionConfidence = Math.max(sectionConfidence, 66);
    inferenceReason.push("Low energy early in phrase suggests intro section.");
  }

  return {
    currentSection,
    sectionConfidence: round(sectionConfidence),
    inferenceReason,
  };
}

export function inferSongStructurePosition(params: {
  phraseTransitionWindow?: "intro" | "buildup" | "phrase_boundary" | "chorus" | "outro" | "unstable";
  phraseSection?: "intro" | "verse" | "buildup" | "drop" | "breakdown" | "bridge" | "outro";
  phrasePosition?: number;
  phraseLengthBars?: number;
  energy?: number;
  dropIntensity?: number;
  /** Live playback path: phrase window from progress beats static section hints. */
  preferPhraseWindow?: boolean;
}): SongStructurePosition & { inferenceReason: string[] } {
  const phraseLengthBars = params.phraseLengthBars ?? 16;
  const phrasePosition = clamp(params.phrasePosition ?? 50, 0, 100);
  const positionBars = (phrasePosition / 100) * phraseLengthBars;
  const remainingBarsInSection = Math.max(0, Math.ceil(phraseLengthBars - positionBars));
  const inferenceReason: string[] = [];

  let currentSection: SongSection = "unknown";
  let sectionConfidence = 42;

  const applyPhraseWindow = () => {
    if (!params.phraseTransitionWindow) return false;
    currentSection = mapPhraseWindowToSongSection(params.phraseTransitionWindow);
    sectionConfidence = 76;
    inferenceReason.push(
      `Exit inferred from live phrase window "${params.phraseTransitionWindow}" at ${phrasePosition.toFixed(0)}% phrase progress.`,
    );
    return true;
  };

  const applyPhraseSection = () => {
    if (!params.phraseSection) return false;
    currentSection = mapPhraseSectionToSongSection(params.phraseSection);
    sectionConfidence = Math.max(sectionConfidence, 68);
    inferenceReason.push(`Exit reinforced by derived phrase section "${params.phraseSection}".`);
    return true;
  };

  if (params.preferPhraseWindow !== false) {
    if (!applyPhraseWindow()) applyPhraseSection();
  } else {
    if (!applyPhraseSection()) applyPhraseWindow();
  }

  if (currentSection === "unknown") {
    inferenceReason.push("No phrase window or section telemetry; applying energy/progress heuristics.");
  }

  const overridden = applyEnergySectionOverrides({
    currentSection,
    sectionConfidence,
    phrasePosition,
    energy: params.energy,
    dropIntensity: params.dropIntensity,
    inferenceReason,
  });

  return {
    currentSection: overridden.currentSection,
    nextSection: NEXT_SECTION_HINT[overridden.currentSection],
    remainingBarsInSection,
    sectionConfidence: overridden.sectionConfidence,
    inferenceReason: overridden.inferenceReason,
  };
}

export function inferCandidateEntrySection(params: {
  phraseCompatibility?: string;
  introLengthBars?: number;
  dropIntensity?: number;
  energy?: number;
  instrumentalSections?: number;
  candidatePhraseSection?: SongSection;
}): { entrySection: SongSection; inferenceReason: string[] } {
  const energy = params.energy ?? 5;
  const introBars = params.introLengthBars ?? 16;
  const inferenceReason: string[] = [];

  if (params.phraseCompatibility === "intro_outro_aligned") {
    inferenceReason.push('Entry locked to intro via phrase compatibility "intro_outro_aligned".');
    return { entrySection: "intro", inferenceReason };
  }
  if (params.phraseCompatibility === "instrumental_to_vocal_drop") {
    inferenceReason.push("Entry inferred as drop from instrumental-to-vocal-drop alignment.");
    return { entrySection: "drop", inferenceReason };
  }
  if (params.phraseCompatibility === "drop_collision") {
    inferenceReason.push("Entry inferred as drop due to drop-collision compatibility flag.");
    return { entrySection: "drop", inferenceReason };
  }
  if (params.candidatePhraseSection && params.candidatePhraseSection !== "unknown") {
    inferenceReason.push(
      `Entry taken from candidate phrase profile section "${params.candidatePhraseSection}".`,
    );
    return { entrySection: params.candidatePhraseSection, inferenceReason };
  }
  if ((params.dropIntensity ?? 0) >= 7 && energy >= 7) {
    inferenceReason.push("High candidate drop intensity and energy indicate drop entry.");
    return { entrySection: "drop", inferenceReason };
  }
  if ((params.instrumentalSections ?? 0) >= 2 && energy >= 6.5) {
    inferenceReason.push("Instrumental sections and energy support build entry.");
    return { entrySection: "build", inferenceReason };
  }
  if (energy >= 7.8) {
    inferenceReason.push("High candidate energy maps to chorus entry.");
    return { entrySection: "chorus", inferenceReason };
  }
  if (energy <= 5) {
    inferenceReason.push("Lower candidate energy maps to breakdown entry.");
    return { entrySection: "breakdown", inferenceReason };
  }
  if (introBars >= 12 && energy <= 6.2) {
    inferenceReason.push(`Long intro (${introBars} bars) and moderate energy default entry to intro.`);
    return { entrySection: "intro", inferenceReason };
  }
  inferenceReason.push("Candidate metadata inconclusive; defaulting entry to verse.");
  return { entrySection: "verse", inferenceReason };
}

export function analyzeExitSection(section: SongSection): ExitSectionAnalysis {
  const exitQuality = round(EXIT_QUALITY[section] ?? EXIT_QUALITY.unknown);
  const reasoning: string[] = [];

  if (section === "outro") {
    reasoning.push("Outro is the highest-quality supervised exit section.");
  } else if (section === "breakdown") {
    reasoning.push("Breakdown provides a strong energy-release exit window.");
  } else if (section === "build") {
    reasoning.push("Build section can exit cleanly before impact escalation.");
  } else if (section === "drop") {
    reasoning.push("Current section is not an ideal exit location.");
    reasoning.push("Drop exits carry the highest musical disruption risk.");
  } else if (section === "chorus") {
    reasoning.push("Chorus exits are playable but less structurally forgiving.");
  } else if (section === "verse") {
    reasoning.push("Verse exit is moderate; phrase boundary timing still matters.");
  } else {
    reasoning.push("Exit section confidence is limited; structure is ambiguous.");
  }

  return { exitSection: section, exitQuality, reasoning };
}

export function analyzeEntrySection(section: SongSection): EntrySectionAnalysis {
  const entryQuality = round(ENTRY_QUALITY[section] ?? ENTRY_QUALITY.unknown);
  const reasoning: string[] = [];

  if (section === "intro") {
    reasoning.push("Incoming section provides strong blend entry opportunity.");
    reasoning.push("Intro entry supports long supervised blend windows.");
  } else if (section === "breakdown") {
    reasoning.push("Breakdown entry supports controlled re-entry and recovery.");
  } else if (section === "build") {
    reasoning.push("Build entry enables tension-preserving handoff.");
  } else if (section === "drop") {
    reasoning.push("Drop entry is high-impact and structurally demanding.");
  } else if (section === "chorus") {
    reasoning.push("Chorus entry is viable but increases vocal collision pressure.");
  } else if (section === "outro") {
    reasoning.push("Outro entry is weak for forward progression.");
  } else {
    reasoning.push("Entry section is inferred with moderate confidence.");
  }

  return { entrySection: section, entryQuality, reasoning };
}

export function computePhraseLockScore(params: {
  phraseAlignmentScore: number;
  exitQuality: number;
  entryQuality: number;
  remainingBarsInSection: number;
}): number {
  const boundaryBonus =
    params.remainingBarsInSection >= 2 && params.remainingBarsInSection <= 6 ? 8 : params.remainingBarsInSection > 6 ? 4 : -6;
  return round(
    params.phraseAlignmentScore * 0.55 +
      params.exitQuality * 0.2 +
      params.entryQuality * 0.15 +
      boundaryBonus,
  );
}

export function resolveLiveStructuralAnalysis(params: {
  userId: string;
  trackName?: string | null;
  playbackProgressMs?: number | null;
  phraseTransitionWindow?: "intro" | "buildup" | "phrase_boundary" | "chorus" | "outro" | "unstable";
  derivedCurrentPhraseSection?: "intro" | "verse" | "buildup" | "drop" | "breakdown" | "bridge" | "outro";
  phrasePosition?: number;
  phraseLengthBars?: number;
  sessionEnergy?: number;
  roomEnergy?: number;
  energyTrend?: number;
  tensionTrend?: number;
  dropIntensity?: number;
  speechiness?: number | null;
  instrumentalness?: number | null;
  executionWindowState?: "stable_window" | "narrow_window" | "unstable_window" | "expired_window";
  phraseCompatibility?: string;
  introLengthBars?: number;
  candidateEnergy?: number;
  instrumentalSections?: number;
  candidatePhraseSection?: SongSection;
  phraseAlignmentScore: number;
}): StructuralCompatibilityAnalysis {
  const phraseLengthBars = params.phraseLengthBars ?? 16;
  const phrasePosition = clamp(params.phrasePosition ?? 50, 0, 100);
  const positionBars = (phrasePosition / 100) * phraseLengthBars;
  const remainingBarsInSection = Math.max(0, Math.ceil(phraseLengthBars - positionBars));

  const classification = resolveSectionClassification({
    phrasePosition: params.phrasePosition,
    phraseTransitionWindow: params.phraseTransitionWindow ?? null,
    derivedCurrentPhraseSection: params.derivedCurrentPhraseSection ?? null,
    sessionEnergy: params.sessionEnergy,
    roomEnergy: params.roomEnergy,
    energyTrend: params.energyTrend,
    tensionTrend: params.tensionTrend,
    dropIntensity: params.dropIntensity,
    speechiness: params.speechiness,
    instrumentalness: params.instrumentalness,
    executionWindowState: params.executionWindowState,
  });

  const energyAdjusted = applyEnergySectionOverrides({
    currentSection: classification.section,
    sectionConfidence: classification.sectionConfidence,
    phrasePosition,
    energy: params.sessionEnergy ?? params.roomEnergy,
    dropIntensity: params.dropIntensity,
    inferenceReason: [...classification.inferenceReason],
  });

  const exitPosition: SongStructurePosition & { inferenceReason: string[] } = {
    currentSection: energyAdjusted.currentSection,
    nextSection: NEXT_SECTION_HINT[energyAdjusted.currentSection],
    remainingBarsInSection,
    sectionConfidence: energyAdjusted.sectionConfidence,
    inferenceReason: energyAdjusted.inferenceReason,
  };

  const entryResolved = inferCandidateEntrySection({
    phraseCompatibility: params.phraseCompatibility,
    introLengthBars: params.introLengthBars,
    dropIntensity: params.dropIntensity,
    energy: params.candidateEnergy,
    instrumentalSections: params.instrumentalSections,
    candidatePhraseSection: params.candidatePhraseSection,
  });

  const analysis = analyzeStructuralCompatibility({
    exitPosition,
    entrySection: entryResolved.entrySection,
    phraseAlignmentScore: params.phraseAlignmentScore,
  });

  const inferenceSource: StructuralInferenceSource = params.phraseTransitionWindow
    ? "live_telemetry"
    : params.derivedCurrentPhraseSection
      ? "mixed_fallback"
      : "candidate_static";

  const inferenceReason = [
    ...exitPosition.inferenceReason,
    ...entryResolved.inferenceReason,
    inferenceSource === "live_telemetry"
      ? "Structural detection used live phrase telemetry with section arbiter (PASS 18.2)."
      : inferenceSource === "mixed_fallback"
        ? "Structural detection mixed phrase section hints with limited window telemetry."
        : "Structural detection fell back to static candidate metadata (no live window).",
  ];

  const validation = buildStructuralDetectionValidation({
    userId: params.userId,
    detectedSection: exitPosition.currentSection,
    playbackProgressMs: params.playbackProgressMs ?? null,
    phrasePosition: params.phrasePosition ?? null,
    phraseTransitionWindow: params.phraseTransitionWindow ?? null,
    derivedCurrentPhraseSection: params.derivedCurrentPhraseSection ?? null,
    sessionEnergy: params.sessionEnergy,
    roomEnergy: params.roomEnergy,
    energyTrend: params.energyTrend,
    tensionTrend: params.tensionTrend,
    dropIntensity: params.dropIntensity,
    executionWindowState: params.executionWindowState,
    inferenceReason,
    arbiterSource: classification.arbiterSource,
    agreementScore: classification.agreementScore,
    classificationInputs: {
      trackName: params.trackName ?? null,
      phraseLengthBars: params.phraseLengthBars ?? null,
      candidatePhraseSection: params.candidatePhraseSection ?? null,
      candidatePhraseCompatibility: params.phraseCompatibility ?? null,
      candidateEnergy: params.candidateEnergy ?? null,
      dropIntensity: params.dropIntensity ?? null,
      preferPhraseWindow: false,
      arbiterSource: classification.arbiterSource,
      audioConfidence: classification.audioConfidence,
      windowGuidanceConfidence: classification.windowGuidanceConfidence,
      executionWindowState: params.executionWindowState ?? null,
    },
  });

  const calibrationSummary = summarizePhraseCalibration(params.userId);

  const structuralAgreement = evaluateStructuralAgreement(
    mapSongSectionToStructuralSection(classification.phraseWindowPrediction),
    mapSongSectionToStructuralSection(classification.audioEvidencePrediction),
  );
  const structuralConfidence = computeStructuralConfidence({
    agreementScore: structuralAgreement.agreementScore,
    sectionConfidence: exitPosition.sectionConfidence,
    phraseAlignment: params.phraseAlignmentScore,
  });
  const converged = structuralAgreement.agreementScore >= 75;
  const structuralConfidenceReasoning = [
    ...structuralAgreement.reasoning,
    `Structural confidence ${structuralConfidence.toFixed(0)} (agreement ${structuralAgreement.agreementScore.toFixed(0)}, section ${exitPosition.sectionConfidence.toFixed(0)}, phrase ${params.phraseAlignmentScore.toFixed(0)}).`,
  ];
  if (!converged) {
    structuralConfidenceReasoning.push("Phrase window and audio evidence have not converged.");
  }

  const structuralArbitration = resolveStructuralArbitration({
    phraseWindowPrediction: classification.phraseWindowPrediction,
    audioEvidencePrediction: classification.audioEvidencePrediction,
    phraseConfidence: classification.windowGuidanceConfidence,
    audioConfidence: classification.audioConfidence,
    agreementScore: structuralAgreement.agreementScore,
  });
  structuralConfidenceReasoning.push(...structuralArbitration.arbitrationReason.slice(-2));

  analysis.structuralConfidence = structuralConfidence;
  analysis.narrativeConfidence = structuralConfidence;
  analysis.converged = converged;
  analysis.structuralAgreement = structuralAgreement;
  analysis.structuralConfidenceReasoning = structuralConfidenceReasoning;
  analysis.reasoning.push(...structuralConfidenceReasoning.slice(0, 2));

  analysis.inference = {
    inferenceSource,
    sectionConfidence: exitPosition.sectionConfidence,
    playbackProgressMs: params.playbackProgressMs ?? null,
    phrasePosition: params.phrasePosition ?? null,
    phraseLengthBars: params.phraseLengthBars ?? null,
    phraseTransitionWindow: params.phraseTransitionWindow ?? null,
    derivedCurrentPhraseSection: params.derivedCurrentPhraseSection ?? null,
    candidatePhraseSection: params.candidatePhraseSection ?? null,
    candidatePhraseCompatibility: params.phraseCompatibility ?? null,
    inferenceReason: validation.debug.inferenceReason,
    debug: validation.debug,
    sectionTransitionTimeline: validation.sectionTransitionTimeline,
    positionDrivenConfidence: validation.positionDrivenConfidence,
    classificationMode: validation.classificationMode,
    phraseAudioAgreement: {
      phraseWindowPrediction: classification.phraseWindowPrediction,
      audioEvidencePrediction: classification.audioEvidencePrediction,
      agreementScore: structuralAgreement.agreementScore,
      disagreementReason:
        structuralAgreement.agreementScore >= 85
          ? null
          : `Phrase window implies "${classification.phraseWindowPrediction}" but audio evidence implies "${classification.audioEvidencePrediction}".`,
    },
    structuralArbitration,
    calibrationSummary: {
      totalObservations: calibrationSummary.totalObservations,
      mismatchRate: calibrationSummary.mismatchRate,
      tracks: calibrationSummary.tracks,
    },
  };

  return analysis;
}

export function analyzeStructuralCompatibility(params: {
  exitPosition: SongStructurePosition;
  entrySection: SongSection;
  phraseAlignmentScore: number;
  inference?: StructuralInferenceDiagnostics;
}): StructuralCompatibilityAnalysis {
  const exit = analyzeExitSection(params.exitPosition.currentSection);
  const entry = analyzeEntrySection(params.entrySection);
  const narrative = evaluateStructuralNarrativeContinuity({
    exitSection: exit.exitSection,
    entrySection: entry.entrySection,
  });

  const phraseLock = computePhraseLockScore({
    phraseAlignmentScore: params.phraseAlignmentScore,
    exitQuality: exit.exitQuality,
    entryQuality: entry.entryQuality,
    remainingBarsInSection: params.exitPosition.remainingBarsInSection,
  });

  const structuralCompatibility = round(
    phraseLock * 0.35 +
      exit.exitQuality * 0.25 +
      entry.entryQuality * 0.25 +
      narrative.score * 0.15,
  );

  const defaultAgreement = evaluateStructuralAgreement("unknown", "unknown");
  const defaultStructuralConfidence = computeStructuralConfidence({
    agreementScore: defaultAgreement.agreementScore,
    sectionConfidence: params.exitPosition.sectionConfidence,
    phraseAlignment: params.phraseAlignmentScore,
  });

  const reasoning = [
    ...exit.reasoning.slice(0, 2),
    ...entry.reasoning.slice(0, 2),
    ...narrative.reasoning.slice(0, 2),
    `Structural compatibility ${structuralCompatibility.toFixed(0)} (phrase lock ${phraseLock.toFixed(0)}).`,
  ];

  return {
    phraseLock,
    exitQuality: exit.exitQuality,
    entryQuality: entry.entryQuality,
    narrativeContinuity: narrative.score,
    structuralCompatibility,
    structuralConfidence: defaultStructuralConfidence,
    narrativeConfidence: defaultStructuralConfidence,
    converged: defaultAgreement.agreementScore >= 75,
    structuralAgreement: defaultAgreement,
    structuralConfidenceReasoning: [...defaultAgreement.reasoning],
    reasoning,
    exitSection: exit.exitSection,
    entrySection: entry.entrySection,
    narrativeContinuityLabel: narrative.continuity,
    inference: params.inference ?? {
      inferenceSource: "candidate_static",
      sectionConfidence: params.exitPosition.sectionConfidence,
      playbackProgressMs: null,
      phrasePosition: null,
      phraseLengthBars: null,
      phraseTransitionWindow: null,
      derivedCurrentPhraseSection: null,
      candidatePhraseSection: entry.entrySection,
      candidatePhraseCompatibility: null,
      inferenceReason: ["Static structural analysis without live telemetry context."],
      debug: {
        playbackProgressMs: null,
        phrasePosition: null,
        phraseWindow: null,
        currentPhraseSection: null,
        currentEnergy: null,
        energyTrend: null,
        tensionTrend: null,
        detectedSection: params.exitPosition.currentSection,
        inferenceReason: ["Static structural analysis without live telemetry context."],
        classificationInputs: {},
      },
      sectionTransitionTimeline: [],
      positionDrivenConfidence: 0,
      classificationMode: "mixed",
      phraseAudioAgreement: {
        phraseWindowPrediction: params.exitPosition.currentSection,
        audioEvidencePrediction: params.exitPosition.currentSection,
        agreementScore: 100,
        disagreementReason: null,
      },
      structuralArbitration: resolveStructuralArbitration({
        phraseWindowPrediction: params.exitPosition.currentSection,
        audioEvidencePrediction: params.exitPosition.currentSection,
        phraseConfidence: params.exitPosition.sectionConfidence,
        audioConfidence: params.exitPosition.sectionConfidence,
        agreementScore: 100,
      }),
    },
  };
}

export function applyStructuralIntelligenceInfluence(params: {
  structural: StructuralCompatibilityAnalysis;
  confidenceScore: number;
  phraseTimingRisk: number;
  narrativeContinuity: number;
  synthesisConfidence: number;
}) {
  const structuralDelta = round((params.structural.structuralCompatibility - 62) * 0.14);
  const phraseRiskReduction = round(
    clamp((params.structural.phraseLock - 55) * 0.12 + (params.structural.exitQuality - 60) * 0.06, 0, 14),
  );
  const narrativeBoost = round((params.structural.narrativeContinuity - 58) * 0.2);
  const synthesisBoost = round((params.structural.structuralCompatibility - 60) * 0.16);

  return {
    confidenceScore: round(clamp(params.confidenceScore + structuralDelta, 0, 100)),
    phraseTimingRisk: round(clamp(params.phraseTimingRisk - phraseRiskReduction, 0, 100)),
    narrativeContinuity: round(clamp(params.narrativeContinuity + narrativeBoost, 0, 100)),
    synthesisConfidence: round(clamp(params.synthesisConfidence + synthesisBoost, 0, 100)),
    structuralDelta,
    phraseRiskReduction,
    narrativeBoost,
    synthesisBoost,
  };
}
