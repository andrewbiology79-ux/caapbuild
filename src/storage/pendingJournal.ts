/**
 * ধাপ ২.৬: ডাটাবেস ও ফোল্ডারের মাঝের অসম্পূর্ণ অবস্থা ধরা।
 *
 * সমস্যা: অ্যাপে প্রশ্ন বদলালে ডাটাবেসে সঙ্গে সঙ্গে সেভ হয়, কিন্তু data.json ~০.৮ সেকেন্ড পরে লেখা হয়।
 * এর মাঝে অ্যাপ বন্ধ হলে বা ফোন অফ হলে "লেখা বাকি" তালিকাটা (মেমরিতে ছিল) হারিয়ে যেত - ফাইল পুরনো
 * থেকে যেত, আর পরের চালুতে mtime/size না বদলানোয় কেউ ধরতও না।
 * সমাধান: "লেখা বাকি" তালিকা ফোনের localStorage-এও রাখা হয়; সফল লেখার পর খালি হয়; পরের চালুতে ফেরত আনা হয়।
 * এই ফাইলে শুধু হিসাব (ডেটা -> লেখা -> পড়া -> মেলানো); ডাটাবেস বা Capacitor লাগে না, তাই টেস্টযোগ্য।
 */
export type JournalKind = 'subject' | 'chapter' | 'topic';

export interface JournalScope {
  entities: Array<[string, JournalKind]>;
  deletes: string[];
  topics: string[];
  imageDeletes: Array<{ id: string; topicId?: string }>;
}

export interface PendingJournal {
  v: 1;
  type: JournalScope;
  chapter: JournalScope;
}

export const PENDING_JOURNAL_KEY = 'qb_pending_writes_v1';

export const emptyJournalScope = (): JournalScope => ({ entities: [], deletes: [], topics: [], imageDeletes: [] });

export function journalIsEmpty(j: PendingJournal): boolean {
  return [j.type, j.chapter].every((s) => s.entities.length + s.deletes.length + s.topics.length + s.imageDeletes.length === 0);
}

export function serializeJournal(j: PendingJournal): string | null {
  return journalIsEmpty(j) ? null : JSON.stringify(j);
}

const KINDS = new Set(['subject', 'chapter', 'topic']);

function cleanScope(raw: any): JournalScope {
  const out = emptyJournalScope();
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.entities)) {
    for (const e of raw.entities) {
      if (Array.isArray(e) && typeof e[0] === 'string' && KINDS.has(e[1])) out.entities.push([e[0], e[1] as JournalKind]);
    }
  }
  if (Array.isArray(raw.deletes)) out.deletes = raw.deletes.filter((x: any) => typeof x === 'string');
  if (Array.isArray(raw.topics)) out.topics = raw.topics.filter((x: any) => typeof x === 'string');
  if (Array.isArray(raw.imageDeletes)) {
    for (const d of raw.imageDeletes) {
      if (d && typeof d.id === 'string') out.imageDeletes.push({ id: d.id, topicId: typeof d.topicId === 'string' ? d.topicId : undefined });
    }
  }
  return out;
}

/** Reads the saved text. Broken / unknown text -> null (nothing restored; never throws). */
export function parseJournal(text: string | null | undefined): PendingJournal | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (!raw || raw.v !== 1) return null;
    const j: PendingJournal = { v: 1, type: cleanScope(raw.type), chapter: cleanScope(raw.chapter) };
    return journalIsEmpty(j) ? null : j;
  } catch {
    return null;
  }
}

/**
 * A pending topic write is only safe to redo when the data.json on disk is still the file the app last
 * wrote / read (same mtime and size as the sync row). If it changed outside the app too, we do NOT overwrite
 * it - the scan reads that file instead (the file wins, as everywhere else) and a warning is shown.
 */
export function canRedoTopicWrite(
  row: { mtime?: number; size?: number } | undefined,
  file: { mtime: number; size: number } | null
): 'redo' | 'file-changed' {
  if (!row || !file) return 'redo'; // nothing remembered, or the file is gone -> writing it is the repair
  return row.mtime === file.mtime && row.size === file.size ? 'redo' : 'file-changed';
}
