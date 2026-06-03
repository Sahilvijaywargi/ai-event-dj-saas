import "server-only";

export type PhraseSection = "intro" | "verse" | "buildup" | "drop" | "breakdown" | "bridge" | "outro";

export type TransitionArchetype =
  | "smooth_blend"
  | "fast_cut"
  | "echo_exit"
  | "tension_swap"
  | "energy_slam"
  | "vocal_swap"
  | "halftime_reset"
  | "atmospheric_bridge"
  | "percussion_overlay";

export type EnergyDirection = "rising" | "stable" | "falling" | "explosive" | "recovery";

export type VocalDensity = "none" | "light" | "medium" | "heavy";

export type TransitionRisk = "safe" | "moderate" | "risky" | "dangerous";

export interface TrackPhraseProfile {
  phraseLength: number;
  currentPhrase: number;
  phraseSection: PhraseSection;
  energyLevel: number;
  vocalDensity: VocalDensity;
  instrumentalIntensity: number;
  harmonicKey: string;
  bpm: number;
  danceability: number;
  tensionLevel: number;
}

export interface TransitionWindow {
  startBar: number;
  endBar: number;
  confidence: number;
  recommendedArchetypes: TransitionArchetype[];
  energyDirection: EnergyDirection;
  safeExit: boolean;
  safeEntry: boolean;
}

export interface TransitionCompatibilityResult {
  compatibilityScore: number;
  harmonicScore: number;
  phraseAlignmentScore: number;
  vocalClashScore: number;
  energyFlowScore: number;
  tensionContinuityScore: number;
  recommendedArchetype: TransitionArchetype;
  riskLevel: TransitionRisk;
  reasoning: string[];
}

export interface PhraseAlignmentResult {
  score: number;
  transitionWindow: TransitionWindow;
  reasoning: string[];
}

export interface VocalCollisionResult {
  score: number;
  reasoning: string[];
}

export interface EnergyFlowResult {
  score: number;
  direction: EnergyDirection;
  reasoning: string[];
}

export interface HarmonicContinuityResult {
  score: number;
  reasoning: string[];
}

type ArchetypeRecommendationInput = {
  outgoing: TrackPhraseProfile;
  incoming: TrackPhraseProfile;
  phraseScore: number;
  vocalScore: number;
  energyScore: number;
  harmonicScore: number;
  tensionScore: number;
  energyDirection: EnergyDirection;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(clamp(value).toFixed(2));
}

function toVocalWeight(vocalDensity: VocalDensity) {
  if (vocalDensity === "none") return 0;
  if (vocalDensity === "light") return 25;
  if (vocalDensity === "medium") return 55;
  return 80;
}

function barsToBoundary(currentBar: number, boundary: number) {
  const normalized = Math.max(0, Math.floor(currentBar));
  return (boundary - (normalized % boundary)) % boundary;
}

function isMixFriendlyExit(section: PhraseSection) {
  return section === "outro" || section === "breakdown" || section === "bridge";
}

function isMixFriendlyEntry(section: PhraseSection) {
  return section === "intro" || section === "buildup" || section === "drop" || section === "bridge";
}

type CamelotKey = { wheel: number; mode: "A" | "B" } | null;

function parseCamelotKey(key: string): CamelotKey {
  const cleaned = key.trim().toUpperCase();
  const match = cleaned.match(/^([1-9]|1[0-2])([AB])$/);
  if (!match) return null;
  return {
    wheel: Number(match[1]),
    mode: match[2] as "A" | "B",
  };
}

function camelotDistance(a: number, b: number) {
  const delta = Math.abs(a - b);
  return Math.min(delta, 12 - delta);
}

function evaluateTensionContinuity(outgoing: TrackPhraseProfile, incoming: TrackPhraseProfile) {
  const reasoning: string[] = [];
  const tensionDelta = Math.abs(incoming.tensionLevel - outgoing.tensionLevel);
  let score = 100 - tensionDelta * 1.35;

  if (outgoing.phraseSection === "buildup" && incoming.phraseSection === "drop") {
    score += 8;
    reasoning.push("Buildup-to-drop handoff supports intentional tension release.");
  }
  if (
    (outgoing.phraseSection === "drop" || outgoing.phraseSection === "verse") &&
    (incoming.phraseSection === "breakdown" || incoming.phraseSection === "bridge")
  ) {
    score += 6;
    reasoning.push("Drop-to-breakdown transition supports controlled recovery.");
  }
  if (outgoing.tensionLevel >= 82 && incoming.tensionLevel >= 82) {
    score -= 10;
    reasoning.push("Both tracks sit in high tension; risk of unresolved pressure stacking.");
  }
  if (tensionDelta >= 35) {
    reasoning.push("Large tension jump detected; continuity likely unstable.");
  } else if (tensionDelta <= 14) {
    reasoning.push("Tension levels are closely matched for smooth continuity.");
  }

  return {
    score: round(score),
    reasoning,
  };
}

function buildWindowArchetypeHints(params: {
  phraseScore: number;
  vocalScore: number;
  harmonicScore: number;
  energyDirection: EnergyDirection;
  outgoing: TrackPhraseProfile;
  incoming: TrackPhraseProfile;
}) {
  const hints: TransitionArchetype[] = [];
  if (params.phraseScore >= 78 && params.harmonicScore >= 72 && params.vocalScore >= 70) {
    hints.push("smooth_blend");
  }
  if (params.energyDirection === "explosive" && params.incoming.phraseSection === "drop") {
    hints.push("energy_slam");
  }
  if (params.outgoing.phraseSection === "buildup" && params.incoming.phraseSection === "drop") {
    hints.push("tension_swap");
  }
  if (params.vocalScore < 48) {
    hints.push("echo_exit", "fast_cut");
  }
  if (params.energyDirection === "recovery") {
    hints.push("atmospheric_bridge", "halftime_reset");
  }
  if (params.outgoing.vocalDensity === "none" && params.incoming.vocalDensity === "none") {
    hints.push("percussion_overlay");
  }
  return Array.from(new Set(hints)).slice(0, 4);
}

export function evaluatePhraseAlignment(
  outgoing: TrackPhraseProfile,
  incoming: TrackPhraseProfile,
): PhraseAlignmentResult {
  const reasoning: string[] = [];
  const offset = Math.abs((outgoing.currentPhrase % 32) - (incoming.currentPhrase % 32));
  const offsetPenalty = Math.min(36, offset * 1.5);

  const align8 = barsToBoundary(outgoing.currentPhrase, 8) === barsToBoundary(incoming.currentPhrase, 8);
  const align16 = barsToBoundary(outgoing.currentPhrase, 16) === barsToBoundary(incoming.currentPhrase, 16);
  const align32 = barsToBoundary(outgoing.currentPhrase, 32) === barsToBoundary(incoming.currentPhrase, 32);

  let score = 44;
  score += align8 ? 18 : -10;
  score += align16 ? 20 : -8;
  score += align32 ? 12 : -4;
  score -= offsetPenalty;

  if (align8) reasoning.push("8-bar phrase lock is aligned.");
  else reasoning.push("8-bar phrase lock is misaligned.");
  if (align16) reasoning.push("16-bar phrase lock supports stable blend timing.");
  if (align32) reasoning.push("32-bar macro-phrase alignment is available.");

  const introOutroCompatible = outgoing.phraseSection === "outro" && incoming.phraseSection === "intro";
  if (introOutroCompatible) {
    score += 16;
    reasoning.push("Outro-to-intro structure is naturally compatible for transitions.");
  }

  const buildupDropCompatible = outgoing.phraseSection === "buildup" && incoming.phraseSection === "drop";
  if (buildupDropCompatible) {
    score += 12;
    reasoning.push("Buildup-to-drop timing creates a coherent impact handoff.");
  }

  const safeExit = isMixFriendlyExit(outgoing.phraseSection) || barsToBoundary(outgoing.currentPhrase, 8) <= 1;
  const safeEntry = isMixFriendlyEntry(incoming.phraseSection) || barsToBoundary(incoming.currentPhrase, 8) <= 1;

  if (!safeExit) reasoning.push("Outgoing phrase is not in an ideal exit section.");
  if (!safeEntry) reasoning.push("Incoming phrase is not in an ideal entry section.");

  score += safeExit ? 5 : -6;
  score += safeEntry ? 5 : -6;

  const energyDirection: EnergyDirection =
    incoming.energyLevel - outgoing.energyLevel > 18
      ? "explosive"
      : incoming.energyLevel - outgoing.energyLevel > 6
        ? "rising"
        : incoming.energyLevel - outgoing.energyLevel < -18
          ? "recovery"
          : incoming.energyLevel - outgoing.energyLevel < -6
            ? "falling"
            : "stable";

  const startBar = Math.max(outgoing.currentPhrase, incoming.currentPhrase) + Math.max(barsToBoundary(outgoing.currentPhrase, 8), barsToBoundary(incoming.currentPhrase, 8));
  const endBar = startBar + (align16 ? 16 : 8);
  const boundedScore = round(score);
  const transitionWindow: TransitionWindow = {
    startBar,
    endBar,
    confidence: boundedScore,
    recommendedArchetypes: buildWindowArchetypeHints({
      phraseScore: boundedScore,
      vocalScore: 65,
      harmonicScore: 65,
      energyDirection,
      outgoing,
      incoming,
    }),
    energyDirection,
    safeExit,
    safeEntry,
  };

  return {
    score: boundedScore,
    transitionWindow,
    reasoning,
  };
}

export function evaluateVocalCollision(outgoing: TrackPhraseProfile, incoming: TrackPhraseProfile): VocalCollisionResult {
  const reasoning: string[] = [];
  const outgoingVocal = toVocalWeight(outgoing.vocalDensity);
  const incomingVocal = toVocalWeight(incoming.vocalDensity);
  let penalty = (outgoingVocal + incomingVocal) * 0.45;

  const isHookSection = (section: PhraseSection) => section === "drop" || section === "buildup";
  const hookOnHook = isHookSection(outgoing.phraseSection) && isHookSection(incoming.phraseSection);
  const verseOnVerse = outgoing.phraseSection === "verse" && incoming.phraseSection === "verse";
  const heavyCollision = outgoing.vocalDensity === "heavy" && incoming.vocalDensity === "heavy";

  if (hookOnHook && incomingVocal >= 55 && outgoingVocal >= 55) {
    penalty += 24;
    reasoning.push("Hook-on-hook overlap risk is high.");
  }
  if (verseOnVerse && incomingVocal >= 55 && outgoingVocal >= 55) {
    penalty += 18;
    reasoning.push("Verse-over-verse overlap detected.");
  }
  if (heavyCollision) {
    penalty += 22;
    reasoning.push("Both tracks carry heavy vocals; collision risk is severe.");
  }
  if ((outgoing.vocalDensity === "none" || outgoing.vocalDensity === "light") && incoming.vocalDensity === "light") {
    reasoning.push("Light vocal entry over sparse outgoing vocals is manageable.");
  }

  return {
    score: round(100 - penalty),
    reasoning,
  };
}

export function evaluateEnergyFlow(outgoing: TrackPhraseProfile, incoming: TrackPhraseProfile): EnergyFlowResult {
  const reasoning: string[] = [];
  const delta = incoming.energyLevel - outgoing.energyLevel;
  const direction: EnergyDirection =
    delta >= 18 ? "explosive" : delta >= 6 ? "rising" : delta <= -18 ? "recovery" : delta <= -6 ? "falling" : "stable";

  let score = 72 - Math.max(0, Math.abs(delta) - 12) * 1.3;

  if (outgoing.energyLevel >= 78 && incoming.energyLevel <= 54) {
    score -= 24;
    reasoning.push("Energy crash risk detected from sharp level drop.");
  }
  if (outgoing.phraseSection === "buildup" && incoming.phraseSection === "drop" && delta >= 6 && delta <= 20) {
    score += 15;
    reasoning.push("Buildup-to-drop transition supports peak escalation.");
  }
  if (
    outgoing.energyLevel >= 75 &&
    incoming.energyLevel >= 58 &&
    incoming.energyLevel <= 72 &&
    (incoming.phraseSection === "breakdown" || incoming.phraseSection === "bridge")
  ) {
    score += 12;
    reasoning.push("Controlled recovery profile protects dancefloor momentum.");
  }
  if (incoming.danceability < 45 && delta > 12) {
    score -= 8;
    reasoning.push("Incoming track is less danceable for the requested energy jump.");
  }
  if (direction === "stable") {
    reasoning.push("Energy trajectory is stable and blend-friendly.");
  }

  return {
    score: round(score),
    direction,
    reasoning,
  };
}

export function evaluateHarmonicContinuity(
  outgoing: TrackPhraseProfile,
  incoming: TrackPhraseProfile,
): HarmonicContinuityResult {
  const reasoning: string[] = [];
  const outgoingCamelot = parseCamelotKey(outgoing.harmonicKey);
  const incomingCamelot = parseCamelotKey(incoming.harmonicKey);

  if (outgoing.harmonicKey.trim().toLowerCase() === incoming.harmonicKey.trim().toLowerCase()) {
    reasoning.push("Exact harmonic key match.");
    return { score: 100, reasoning };
  }

  if (!outgoingCamelot || !incomingCamelot) {
    const fallbackScore = outgoing.harmonicKey && incoming.harmonicKey ? 54 : 42;
    reasoning.push("Non-Camelot keys supplied; using conservative harmonic fallback.");
    return { score: round(fallbackScore), reasoning };
  }

  const wheelDistance = camelotDistance(outgoingCamelot.wheel, incomingCamelot.wheel);
  const sameMode = outgoingCamelot.mode === incomingCamelot.mode;
  const relativeMajorMinor = outgoingCamelot.wheel === incomingCamelot.wheel && !sameMode;

  let score = 40;
  if (wheelDistance === 0 && sameMode) {
    score = 100;
    reasoning.push("Exact Camelot key match.");
  } else if (wheelDistance === 1 && sameMode) {
    score = 88;
    reasoning.push("Camelot adjacent key movement is harmonically safe.");
  } else if (relativeMajorMinor) {
    score = 84;
    reasoning.push("Compatible major/minor movement on same Camelot wheel.");
  } else if (wheelDistance <= 2) {
    score = 70 - (sameMode ? 0 : 4);
    reasoning.push("Near-key movement is playable with tight EQ control.");
  } else {
    score = 34 - wheelDistance * 2;
    reasoning.push("Distant key relationship introduces dissonance risk.");
  }

  if (outgoing.instrumentalIntensity >= 70 && incoming.instrumentalIntensity >= 70 && score < 72) {
    score += 4;
    reasoning.push("High instrumental content can mask moderate harmonic mismatch.");
  }

  return {
    score: round(score),
    reasoning,
  };
}

export function recommendTransitionArchetype(params: ArchetypeRecommendationInput) {
  const reasoning: string[] = [];
  const bpmGap = Math.abs(params.outgoing.bpm - params.incoming.bpm);

  if (params.vocalScore < 38) {
    if (params.outgoing.vocalDensity === "heavy" && params.incoming.vocalDensity === "heavy") {
      reasoning.push("Heavy vocal collision risk favors echo-assisted vocal clearance.");
      return { archetype: "echo_exit" as const, reasoning };
    }
    reasoning.push("Low vocal compatibility favors minimal overlap transition.");
    return { archetype: "fast_cut" as const, reasoning };
  }

  if (params.phraseScore >= 82 && params.harmonicScore >= 78 && params.energyScore >= 66 && params.energyDirection !== "explosive") {
    reasoning.push("Phrase and harmonic locks support a long-form smooth blend.");
    return { archetype: "smooth_blend" as const, reasoning };
  }

  if (params.energyDirection === "explosive" && params.tensionScore >= 68 && params.phraseScore >= 64) {
    reasoning.push("Explosive energy handoff fits an impact-style slam transition.");
    return { archetype: "energy_slam" as const, reasoning };
  }

  if (params.outgoing.phraseSection === "buildup" && params.incoming.phraseSection === "drop" && params.tensionScore >= 62) {
    reasoning.push("Buildup-to-drop phrasing favors tension swap execution.");
    return { archetype: "tension_swap" as const, reasoning };
  }

  if (bpmGap >= 12 && params.energyDirection === "recovery") {
    reasoning.push("Large tempo gap with recovery intent favors halftime reset.");
    return { archetype: "halftime_reset" as const, reasoning };
  }

  if (params.energyDirection === "recovery" || params.energyDirection === "falling") {
    reasoning.push("Recovery direction favors atmospheric bridge to preserve floor control.");
    return { archetype: "atmospheric_bridge" as const, reasoning };
  }

  if (params.outgoing.vocalDensity !== "none" && params.incoming.vocalDensity !== "none" && params.vocalScore < 62) {
    reasoning.push("Moderate vocal collision risk favors vocal swap phrasing.");
    return { archetype: "vocal_swap" as const, reasoning };
  }

  if (params.outgoing.vocalDensity === "none" && params.incoming.vocalDensity === "none" && params.harmonicScore < 64) {
    reasoning.push("Low-vocal instrumental context supports percussion overlay masking.");
    return { archetype: "percussion_overlay" as const, reasoning };
  }

  reasoning.push("Defaulting to controlled smooth blend for continuity.");
  return { archetype: "smooth_blend" as const, reasoning };
}

export function analyzeTransitionCompatibility(
  outgoing: TrackPhraseProfile,
  incoming: TrackPhraseProfile,
): TransitionCompatibilityResult {
  const phrase = evaluatePhraseAlignment(outgoing, incoming);
  const vocal = evaluateVocalCollision(outgoing, incoming);
  const energy = evaluateEnergyFlow(outgoing, incoming);
  const harmonic = evaluateHarmonicContinuity(outgoing, incoming);
  const tension = evaluateTensionContinuity(outgoing, incoming);

  const recommendation = recommendTransitionArchetype({
    outgoing,
    incoming,
    phraseScore: phrase.score,
    vocalScore: vocal.score,
    energyScore: energy.score,
    harmonicScore: harmonic.score,
    tensionScore: tension.score,
    energyDirection: energy.direction,
  });

  const compatibilityScore = round(
    phrase.score * 0.25 +
      harmonic.score * 0.24 +
      vocal.score * 0.15 +
      energy.score * 0.2 +
      tension.score * 0.16,
  );

  let riskLevel: TransitionRisk = "safe";
  if (
    vocal.score < 30 ||
    harmonic.score < 34 ||
    phrase.score < 34 ||
    energy.score < 30 ||
    compatibilityScore < 38
  ) {
    riskLevel = "dangerous";
  } else if (
    vocal.score < 48 ||
    harmonic.score < 52 ||
    phrase.score < 50 ||
    energy.score < 50 ||
    compatibilityScore < 55
  ) {
    riskLevel = "risky";
  } else if (compatibilityScore < 72 || tension.score < 58) {
    riskLevel = "moderate";
  }

  const reasoning = [
    ...phrase.reasoning.slice(0, 2),
    ...vocal.reasoning.slice(0, 2),
    ...energy.reasoning.slice(0, 2),
    ...harmonic.reasoning.slice(0, 2),
    ...tension.reasoning.slice(0, 2),
    ...recommendation.reasoning.slice(0, 2),
    `Overall compatibility score ${compatibilityScore.toFixed(2)} with ${riskLevel} transition risk.`,
  ];

  return {
    compatibilityScore,
    harmonicScore: harmonic.score,
    phraseAlignmentScore: phrase.score,
    vocalClashScore: vocal.score,
    energyFlowScore: energy.score,
    tensionContinuityScore: tension.score,
    recommendedArchetype: recommendation.archetype,
    riskLevel,
    reasoning: reasoning.slice(0, 12),
  };
}
