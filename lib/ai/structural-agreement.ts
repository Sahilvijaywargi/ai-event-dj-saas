import "server-only";

export type StructuralSection =
  | "intro"
  | "verse"
  | "build"
  | "chorus"
  | "drop"
  | "breakdown"
  | "bridge"
  | "outro"
  | "unknown";

export interface StructuralAgreementResult {
  agreementScore: number;
  confidence: number;
  severity: "low" | "moderate" | "high";
  reasoning: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function normalizePair(a: StructuralSection, b: StructuralSection): [StructuralSection, StructuralSection] {
  return a <= b ? [a, b] : [b, a];
}

const ADJACENT_SCORES = new Map<string, number>([
  [normalizePair("verse", "build").join("|"), 68],
  [normalizePair("build", "chorus").join("|"), 72],
  [normalizePair("chorus", "drop").join("|"), 70],
  [normalizePair("drop", "breakdown").join("|"), 65],
  [normalizePair("intro", "verse").join("|"), 70],
  [normalizePair("breakdown", "build").join("|"), 68],
  [normalizePair("bridge", "verse").join("|"), 62],
  [normalizePair("bridge", "chorus").join("|"), 64],
  [normalizePair("bridge", "build").join("|"), 66],
  [normalizePair("breakdown", "chorus").join("|"), 60],
  [normalizePair("build", "drop").join("|"), 63],
  [normalizePair("verse", "bridge").join("|"), 61],
  [normalizePair("outro", "breakdown").join("|"), 58],
  [normalizePair("intro", "build").join("|"), 60],
]);

const MAJOR_MISMATCH_SCORES = new Map<string, number>([
  [normalizePair("verse", "chorus").join("|"), 32],
  [normalizePair("intro", "drop").join("|"), 22],
  [normalizePair("outro", "build").join("|"), 28],
  [normalizePair("verse", "drop").join("|"), 26],
  [normalizePair("intro", "chorus").join("|"), 30],
  [normalizePair("outro", "chorus").join("|"), 34],
  [normalizePair("intro", "breakdown").join("|"), 24],
  [normalizePair("verse", "outro").join("|"), 20],
  [normalizePair("chorus", "outro").join("|"), 36],
  [normalizePair("drop", "intro").join("|"), 18],
]);

function formatSectionLabel(section: StructuralSection) {
  return section.replace(/_/g, " ");
}

function resolveSeverity(score: number): StructuralAgreementResult["severity"] {
  if (score >= 75) return "low";
  if (score >= 40) return "moderate";
  return "high";
}

function resolveConfidence(score: number, phraseSection: StructuralSection, audioSection: StructuralSection) {
  if (phraseSection === "unknown" || audioSection === "unknown") {
    return round(clamp(score * 0.45, 0, 100));
  }
  return round(clamp(score, 0, 100));
}

export function evaluateStructuralAgreement(
  phraseSection: StructuralSection,
  audioSection: StructuralSection,
): StructuralAgreementResult {
  const reasoning: string[] = [];

  if (phraseSection === audioSection) {
    reasoning.push(`Phrase model and audio evidence agree on ${formatSectionLabel(phraseSection)}.`);
    reasoning.push("Structural agreement is exact.");
    return {
      agreementScore: 100,
      confidence: 100,
      severity: "low",
      reasoning,
    };
  }

  if (phraseSection === "unknown" || audioSection === "unknown") {
    const known = phraseSection === "unknown" ? audioSection : phraseSection;
    const score = known === "intro" || known === "outro" ? 18 : 14;
    reasoning.push(
      phraseSection === "unknown"
        ? "Phrase window prediction unavailable."
        : "Audio evidence prediction unavailable.",
    );
    reasoning.push(`Known signal suggests ${formatSectionLabel(known)}.`);
    reasoning.push("Structural agreement uncertain due to missing inference channel.");
    return {
      agreementScore: score,
      confidence: resolveConfidence(score, phraseSection, audioSection),
      severity: "high",
      reasoning,
    };
  }

  reasoning.push(`Audio evidence suggests ${formatSectionLabel(audioSection)}.`);
  reasoning.push(`Phrase model predicts ${formatSectionLabel(phraseSection)}.`);

  const pairKey = normalizePair(phraseSection, audioSection).join("|");
  const adjacentScore = ADJACENT_SCORES.get(pairKey);
  if (adjacentScore != null) {
    reasoning.push("Adjacent structural sections detected; partial agreement.");
    return {
      agreementScore: adjacentScore,
      confidence: resolveConfidence(adjacentScore, phraseSection, audioSection),
      severity: resolveSeverity(adjacentScore),
      reasoning,
    };
  }

  const mismatchScore = MAJOR_MISMATCH_SCORES.get(pairKey) ?? 38;
  reasoning.push("Structural disagreement detected.");
  if (mismatchScore < 35) {
    reasoning.push("Major section mismatch between phrase position and audio evidence.");
  }
  return {
    agreementScore: mismatchScore,
    confidence: resolveConfidence(mismatchScore, phraseSection, audioSection),
    severity: resolveSeverity(mismatchScore),
    reasoning,
  };
}
