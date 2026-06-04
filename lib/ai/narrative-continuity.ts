import "server-only";

import type { SongSection } from "@/lib/ai/song-structure";

export interface NarrativeContinuityAnalysis {
  score: number;
  continuity: "excellent" | "good" | "moderate" | "weak";
  reasoning: string[];
}

type TransitionPair = `${SongSection}_to_${SongSection}`;

const TRANSITION_SCORES: Partial<Record<TransitionPair, number>> = {
  verse_to_verse: 82,
  verse_to_chorus: 88,
  verse_to_build: 80,
  verse_to_breakdown: 76,
  verse_to_intro: 58,
  verse_to_drop: 52,
  pre_chorus_to_chorus: 90,
  pre_chorus_to_drop: 72,
  chorus_to_breakdown: 86,
  chorus_to_verse: 70,
  chorus_to_build: 74,
  chorus_to_drop: 48,
  build_to_drop: 92,
  build_to_chorus: 78,
  build_to_breakdown: 84,
  breakdown_to_build: 90,
  breakdown_to_intro: 72,
  breakdown_to_verse: 76,
  drop_to_breakdown: 84,
  drop_to_build: 68,
  drop_to_chorus: 46,
  drop_to_drop: 32,
  outro_to_intro: 94,
  outro_to_breakdown: 80,
  outro_to_verse: 66,
  intro_to_verse: 86,
  intro_to_build: 82,
  intro_to_drop: 58,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(clamp(value, 0, 100).toFixed(2));
}

function pairKey(exitSection: SongSection, entrySection: SongSection): TransitionPair {
  return `${exitSection}_to_${entrySection}` as TransitionPair;
}

function labelFromScore(score: number): NarrativeContinuityAnalysis["continuity"] {
  if (score >= 82) return "excellent";
  if (score >= 68) return "good";
  if (score >= 52) return "moderate";
  return "weak";
}

function defaultScore(exitSection: SongSection, entrySection: SongSection): number {
  const exitWeight =
    exitSection === "outro" || exitSection === "breakdown"
      ? 12
      : exitSection === "build"
        ? 8
        : exitSection === "drop" || exitSection === "chorus"
          ? -8
          : 0;
  const entryWeight =
    entrySection === "intro" || entrySection === "breakdown"
      ? 12
      : entrySection === "build"
        ? 8
        : entrySection === "drop"
          ? -10
          : 0;
  return clamp(58 + exitWeight + entryWeight, 28, 78);
}

function explainTransition(exitSection: SongSection, entrySection: SongSection, score: number): string[] {
  const reasoning: string[] = [];
  const key = pairKey(exitSection, entrySection);
  const known = TRANSITION_SCORES[key];

  if (known != null && known >= 82) {
    reasoning.push(
      `${exitSection.replace(/_/g, " ")} → ${entrySection.replace(/_/g, " ")} preserves strong narrative flow.`,
    );
  } else if (exitSection === "drop" && entrySection === "drop") {
    reasoning.push("Narrative continuity weakened by drop-to-drop transition.");
  } else if (exitSection === "chorus" && entrySection === "drop") {
    reasoning.push("Narrative continuity weakened by chorus-to-drop transition.");
  } else if (exitSection === "breakdown" && entrySection === "build") {
    reasoning.push("Breakdown-to-build progression improves continuity.");
  } else if (exitSection === "outro" && entrySection === "intro") {
    reasoning.push("Outro-to-intro reset is an excellent narrative handoff.");
  } else if (score < 52) {
    reasoning.push(
      `Narrative continuity weakened by ${exitSection.replace(/_/g, " ")}-to-${entrySection.replace(/_/g, " ")} transition.`,
    );
  } else {
    reasoning.push(
      `${exitSection.replace(/_/g, " ")} → ${entrySection.replace(/_/g, " ")} is structurally acceptable with timing discipline.`,
    );
  }

  return reasoning;
}

export function evaluateStructuralNarrativeContinuity(params: {
  exitSection: SongSection;
  entrySection: SongSection;
}): NarrativeContinuityAnalysis {
  const key = pairKey(params.exitSection, params.entrySection);
  const score = round(TRANSITION_SCORES[key] ?? defaultScore(params.exitSection, params.entrySection));
  const continuity = labelFromScore(score);
  const reasoning = explainTransition(params.exitSection, params.entrySection, score);

  return { score, continuity, reasoning };
}
