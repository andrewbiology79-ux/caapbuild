import { db, chapterDb } from '../db/db';

/**
 * Text used to compare two questions: spaces, line breaks, "$" formula marks, brackets and
 * punctuation are ignored, so a copy that only differs in spacing / formula marks still matches.
 */
export function normalizeForCompare(text: string | undefined | null): string {
  return (text || '')
    .toLowerCase()
    .replace(/\[\[(?:img:[^\]\s]+|box)\]\]/g, '')
    .replace(/[\s$\\{}()[\]।.,;:!?'"“”‘’\-–—_]/g, '');
}

export interface DuplicateHit {
  kind: 'উদ্দীপক' | 'প্রশ্ন';
  where: 'Type CQ' | 'Chapter CQ';
  snippet: string;
}

const MIN_QUESTION_LENGTH = 12; // very short texts ("কত?") would match by accident

function snippetOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

/**
 * Looks in BOTH collections (Type CQ and Chapter CQ) for a stimulus or a question with the same
 * (normalized) text. Everything that belongs to the group being saved is ignored.
 */
export async function findDuplicateQuestions(input: {
  stimulusId?: string;
  stimulusText: string;
  questions: Array<{ id?: string; questionText: string }>;
}): Promise<DuplicateHit[]> {
  const hits: DuplicateHit[] = [];
  const stimKey = normalizeForCompare(input.stimulusText);
  const ownQuestionIds = new Set(input.questions.map((q) => q.id).filter(Boolean) as string[]);
  const qKeys = new Map<string, string>(); // normalized text -> original text
  for (const q of input.questions) {
    const key = normalizeForCompare(q.questionText);
    if (key.length >= MIN_QUESTION_LENGTH) qKeys.set(key, q.questionText);
  }

  const scopes: Array<{ name: DuplicateHit['where']; database: typeof db }> = [
    { name: 'Type CQ', database: db },
    { name: 'Chapter CQ', database: chapterDb },
  ];

  for (const { name, database } of scopes) {
    if (stimKey.length >= MIN_QUESTION_LENGTH) {
      await database.stimuli.each((s) => {
        if (s.id === input.stimulusId) return;
        if (normalizeForCompare(s.text) === stimKey) {
          hits.push({ kind: 'উদ্দীপক', where: name, snippet: snippetOf(s.text) });
        }
      });
    }
    if (qKeys.size > 0) {
      await database.questions.each((q) => {
        if (ownQuestionIds.has(q.id)) return;
        if (input.stimulusId && q.stimulusId === input.stimulusId) return;
        const key = normalizeForCompare(q.questionText);
        if (qKeys.has(key)) {
          hits.push({ kind: 'প্রশ্ন', where: name, snippet: snippetOf(q.questionText) });
        }
      });
    }
  }
  return hits;
}
