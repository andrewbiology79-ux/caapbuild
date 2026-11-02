import type { PaperEdits, Question, Stimulus } from '../db/db';

type Group = { stimulus?: Stimulus; questions: Question[] };

export function isQuestionEdited(edits: PaperEdits | undefined, questionId: string): boolean {
  return Boolean(edits?.questions?.[questionId]);
}

export function isStimulusEdited(edits: PaperEdits | undefined, stimulusId?: string): boolean {
  return Boolean(stimulusId && edits?.stimuli?.[stimulusId]);
}

/** Question as it appears INSIDE the paper (paper-only change on top of the bank question) */
export function applyQuestionEdit(q: Question, edits?: PaperEdits): Question {
  const e = edits?.questions?.[q.id];
  if (!e) return q;
  return {
    ...q,
    questionText: e.questionText,
    marks: e.marks,
    solutionText: e.solutionText !== undefined ? e.solutionText : q.solutionText,
  };
}

export function applyStimulusEdit(s: Stimulus | undefined, edits?: PaperEdits): Stimulus | undefined {
  if (!s) return s;
  const e = edits?.stimuli?.[s.id];
  return e ? { ...s, text: e.text } : s;
}

/** Apply the paper-only edits to loaded groups (used by preview, PDF and lists). Returns new objects. */
export function applyEditsToGroups<G extends Group>(groups: G[], edits?: PaperEdits): G[] {
  if (!edits || (!edits.questions && !edits.stimuli)) return groups;
  return groups.map((g) => ({
    ...g,
    stimulus: applyStimulusEdit(g.stimulus, edits),
    questions: g.questions.map((q) => applyQuestionEdit(q, edits)),
  }));
}

export function hasAnyEdit(edits?: PaperEdits): boolean {
  return Boolean(
    edits && (Object.keys(edits.questions || {}).length > 0 || Object.keys(edits.stimuli || {}).length > 0)
  );
}

/** Drop edits of questions / stimuli that are no longer in the paper. Returns undefined when nothing is left. */
export function pruneEdits(
  edits: PaperEdits | undefined,
  questionIds: string[],
  stimulusIds: string[]
): PaperEdits | undefined {
  if (!edits) return undefined;
  const qs: NonNullable<PaperEdits['questions']> = {};
  const ss: NonNullable<PaperEdits['stimuli']> = {};
  for (const id of questionIds) if (edits.questions?.[id]) qs[id] = edits.questions[id];
  for (const id of stimulusIds) if (edits.stimuli?.[id]) ss[id] = edits.stimuli[id];
  const out: PaperEdits = {};
  if (Object.keys(qs).length) out.questions = qs;
  if (Object.keys(ss).length) out.stimuli = ss;
  return hasAnyEdit(out) ? out : undefined;
}
