import type { CqScope } from '../db/db';
import type { ChangeAction, ConflictEntry, ConflictKind, PreviewEntry, PreviewTotals, TopicDiff } from './syncCompare';
import type { SyncDirection, SyncPreview } from './syncPreview';
import { PHASE_LABEL, type SyncProgress } from './syncProgress';
import { toBn } from '../utils/toBn';

/**
 * ধাপ ৩ - সিঙ্ক উইন্ডোর (SyncPreviewDialog) ভিউ-মডেল ও বাংলা লেখা। খাঁটি কোড: কোনো IO নেই, React নেই,
 * তাই আলাদাভাবে টেস্ট করা যায়। (শুধু টাইপ import - চালানোর সময় Dexie/Capacitor লাগে না।)
 */

/* ------------------------------------------------------------------
 * উইন্ডোর অবস্থা
 * ---------------------------------------------------------------- */

/** চলতে থাকা / শেষের সংখ্যা: কয়টি যোগ / বদল / মোছা / কনফ্লিক্ট সরানো */
export interface SyncCounts {
  add: number;
  create: number;
  rename: number;
  move: number;
  update: number;
  delete: number;
  conflictsMoved: number;
}

export const emptyCounts = (): SyncCounts => ({ add: 0, create: 0, rename: 0, move: 0, update: 0, delete: 0, conflictsMoved: 0 });

export interface SyncResultConflict extends ConflictEntry {
  /** সত্যিই সরানো হয়েছে (অটো সিঙ্ক নিজে সরায় না: false) */
  moved: boolean;
}

export interface SyncResultView {
  counts: SyncCounts;
  conflicts: SyncResultConflict[];
  warnings: string[];
  /** Sync_Conflicts/<stamp> */
  stamp?: string;
  /** কিছু বদলায়নি এবং কোনো কনফ্লিক্টও নেই */
  nothingChanged: boolean;
}

export type SyncDialogState =
  | { kind: 'calculating'; direction: SyncDirection; auto?: boolean; progress: SyncProgress | null }
  | { kind: 'preview'; preview: SyncPreview }
  | { kind: 'running'; direction: SyncDirection; auto?: boolean; progress: SyncProgress | null; counts: SyncCounts }
  | { kind: 'result'; direction: SyncDirection; auto?: boolean; result: SyncResultView }
  | { kind: 'error'; direction: SyncDirection; auto?: boolean; message: string; stage?: string; dataSafe: boolean };

export function makeResultView(
  counts: SyncCounts,
  conflicts: SyncResultConflict[],
  warnings: string[] = [],
  stamp?: string
): SyncResultView {
  const sum = counts.add + counts.create + counts.rename + counts.move + counts.update + counts.delete + counts.conflictsMoved;
  return { counts, conflicts, warnings, stamp, nothingChanged: sum === 0 && conflicts.length === 0 };
}

/** আসল সিঙ্ক চলার সময়ও Back ব্লক থাকবে; উইন্ডো কখন কোন বাটন দেখাবে তার নিয়ম */
export function isBlocking(state: SyncDialogState | null): boolean {
  return !!state && state.kind === 'running';
}

/* ------------------------------------------------------------------
 * লেখা
 * ---------------------------------------------------------------- */

export const AUTO_CONFLICT_HINT = 'কনফ্লিক্ট আছে, মেনু থেকে সিঙ্ক করে সমাধান করুন';

const DIRECTION_LABEL: Record<SyncDirection, string> = {
  'folder-to-app': 'ফোল্ডার → অ্যাপ',
  'app-to-folder': 'অ্যাপ → ফোল্ডার',
};

export function directionLabel(d: SyncDirection): string {
  return DIRECTION_LABEL[d];
}

export function dialogTitle(direction: SyncDirection, auto?: boolean): string {
  return `${auto ? 'স্বয়ংক্রিয় সিঙ্ক' : 'সিঙ্ক'}: ${directionLabel(direction)}`;
}

export const KIND_LABEL = { subject: 'বিষয়', chapter: 'অধ্যায়', topic: 'টাইপ' } as const;

export const ACTION_LABEL: Record<ChangeAction, string> = {
  add: 'নতুন',
  create: 'ফোল্ডার তৈরি',
  rename: 'নাম বদল',
  move: 'সরানো',
  delete: 'মোছা',
  update: 'আপডেট',
  info: 'তথ্য',
};

export const CONFLICT_KIND_LABEL: Record<ConflictKind, string> = {
  'duplicate-id': 'কপি করা ফোল্ডার',
  'both-changed': 'দুই দিকেই বদল',
  'data-differs': 'ডেটা মেলে না',
  'extra-folder': 'বাড়তি ফোল্ডার',
  'extra-media': 'বাড়তি ছবি',
  'same-name': 'একই নামের আইটেম',
};

export const SCOPE_TITLE: Record<CqScope, string> = { type: 'Type CQ', chapter: 'Chapter CQ' };

const n = (v: number) => toBn(v);

/** একটি টাইপ/অধ্যায়ের প্রশ্ন-পার্থক্যের সারাংশ */
export function topicDiffText(t: TopicDiff | undefined): string {
  if (!t) return '';
  const parts: string[] = [];
  if (t.questionsAdded.length) parts.push(`${n(t.questionsAdded.length)}টি প্রশ্ন যোগ`);
  if (t.questionsRemoved.length) parts.push(`${n(t.questionsRemoved.length)}টি প্রশ্ন বাদ`);
  if (t.questionsChanged.length) parts.push(`${n(t.questionsChanged.length)}টি প্রশ্ন বদল`);
  if (t.stimuliAdded) parts.push(`${n(t.stimuliAdded)}টি উদ্দীপক যোগ`);
  if (t.stimuliRemoved) parts.push(`${n(t.stimuliRemoved)}টি উদ্দীপক বাদ`);
  if (t.stimuliChanged) parts.push(`${n(t.stimuliChanged)}টি উদ্দীপক বদল`);
  if (t.imagesNew) parts.push(`${n(t.imagesNew)}টি নতুন ছবি`);
  if (t.imagesMissing.length) parts.push(`${n(t.imagesMissing.length)}টি ছবির ফাইল নেই`);
  if (t.imagesToWrite) parts.push(`${n(t.imagesToWrite)}টি ছবি লেখা হবে`);
  return parts.join(', ');
}

export interface EntryText {
  action: ChangeAction;
  actionLabel: string;
  kindLabel: string;
  /** বিষয় › অধ্যায় › টাইপ */
  pathText: string;
  /** নাম বদল / সরানোর "আগে → পরে" */
  change?: string;
  detail: string;
}

export function entryText(e: PreviewEntry): EntryText {
  let change: string | undefined;
  if (e.from && e.to) change = `${e.from} → ${e.to}`;
  else if (e.from) change = `আগের জায়গা: ${e.from}`;
  const detail = [topicDiffText(e.topic), e.note].filter(Boolean).join(' · ');
  return {
    action: e.action,
    actionLabel: ACTION_LABEL[e.action],
    kindLabel: KIND_LABEL[e.kind],
    pathText: e.path.join(' › '),
    change,
    detail,
  };
}

export interface EntryGroup {
  key: string;
  scope: CqScope;
  scopeTitle: string;
  subject: string;
  entries: PreviewEntry[];
}

/** Type CQ আগে, তারপর Chapter CQ; প্রতিটির ভেতরে বিষয় অনুযায়ী (প্রথম দেখার ক্রমে) */
export function groupEntries(entries: PreviewEntry[]): EntryGroup[] {
  const groups = new Map<string, EntryGroup>();
  for (const e of entries) {
    const subject = e.path[0] ?? '';
    const key = `${e.scope}|${subject}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, scope: e.scope, scopeTitle: SCOPE_TITLE[e.scope], subject, entries: [] };
      groups.set(key, g);
    }
    g.entries.push(e);
  }
  const order: Record<CqScope, number> = { type: 0, chapter: 1 };
  return [...groups.values()].sort((a, b) => order[a.scope] - order[b.scope]);
}

export interface Chip {
  key: string;
  text: string;
  tone: 'neutral' | 'danger' | 'warn';
}

/** প্রিভিউয়ের মাথার সংখ্যা; কনফ্লিক্ট আলাদা (conflictChip), এখানে মেশে না */
export function totalsChips(t: PreviewTotals): Chip[] {
  const out: Chip[] = [];
  if (t.add) out.push({ key: 'add', text: `${n(t.add)}টি নতুন`, tone: 'neutral' });
  if (t.create) out.push({ key: 'create', text: `${n(t.create)}টি ফোল্ডার তৈরি`, tone: 'neutral' });
  if (t.rename) out.push({ key: 'rename', text: `${n(t.rename)}টির নাম বদল`, tone: 'neutral' });
  if (t.move) out.push({ key: 'move', text: `${n(t.move)}টি সরানো`, tone: 'neutral' });
  if (t.update) out.push({ key: 'update', text: `${n(t.update)}টি আপডেট`, tone: 'neutral' });
  if (t.delete) out.push({ key: 'delete', text: `${n(t.delete)}টি মোছা`, tone: 'danger' });
  return out;
}

export function conflictChip(t: PreviewTotals): Chip | null {
  return t.conflicts ? { key: 'conflicts', text: `${n(t.conflicts)}টি কনফ্লিক্ট`, tone: 'warn' } : null;
}

/** "৩টি প্রশ্ন যোগ, ১টি বাদ, ২টি বদল" */
export function questionsLine(t: PreviewTotals): string {
  const parts: string[] = [];
  if (t.questionsAdded) parts.push(`${n(t.questionsAdded)}টি প্রশ্ন যোগ`);
  if (t.questionsRemoved) parts.push(`${n(t.questionsRemoved)}টি প্রশ্ন বাদ`);
  if (t.questionsChanged) parts.push(`${n(t.questionsChanged)}টি প্রশ্ন বদল`);
  if (t.imagesToWrite) parts.push(`${n(t.imagesToWrite)}টি ছবি লেখা হবে`);
  return parts.join(', ');
}

export function conflictMoveText(c: Pick<ConflictEntry, 'moveTo'>, moved: boolean, auto?: boolean): string {
  if (moved) return `সরানো হয়েছে: ${c.moveTo}`;
  if (auto) return `অটো সিঙ্ক সরায় না। মেনু থেকে সিঙ্ক করলে সরবে: ${c.moveTo}`;
  return `সরানো হবে: ${c.moveTo}`;
}

/* ------------------------------------------------------------------
 * প্রগ্রেস বারের লেখা
 * ---------------------------------------------------------------- */

export function percentText(p: SyncProgress): string {
  return `${n(p.percent)}%`;
}

/** "৩৪ / ১২০ ধাপ সম্পন্ন, বাকি ৮৬" */
export function progressLine(p: SyncProgress): string {
  return `${n(p.done)} / ${n(p.total)} ধাপ সম্পন্ন, বাকি ${n(Math.max(0, p.total - p.done))}`;
}

/** "data.json লেখা: পদার্থবিজ্ঞান › ... " */
export function currentWork(p: SyncProgress): string {
  return p.label ? `${PHASE_LABEL[p.phase]}: ${p.label}` : PHASE_LABEL[p.phase];
}

export interface CounterCell {
  key: 'added' | 'changed' | 'deleted' | 'conflicts';
  label: string;
  value: number;
}

/** চলতে থাকা সংখ্যা: যোগ / বদল / মোছা / কনফ্লিক্ট সরানো */
export function counterCells(c: SyncCounts): CounterCell[] {
  return [
    { key: 'added', label: 'যোগ', value: c.add + c.create },
    { key: 'changed', label: 'বদল', value: c.update + c.rename + c.move },
    { key: 'deleted', label: 'মোছা', value: c.delete },
    { key: 'conflicts', label: 'কনফ্লিক্ট সরানো', value: c.conflictsMoved },
  ];
}

export function resultHeadline(r: SyncResultView): string {
  return r.nothingChanged ? 'সিঙ্ক সম্পন্ন - কিছু বদলায়নি' : 'সিঙ্ক সম্পন্ন';
}

/** মেনুতে চাপলে কেন সিঙ্ক শুরু হলো না - বুঝিয়ে বলার লেখা (খাঁটি ফাংশন, টেস্ট করা যায়) */
export function syncUnavailableReason(native: boolean, enabled: boolean): string | null {
  if (!native) return 'ফোল্ডার সিঙ্ক শুধু অ্যান্ড্রয়েড অ্যাপে চলে (ব্রাউজারে নয়)';
  if (!enabled) return 'ফোল্ডার সিঙ্ক এখনো চালু হয়নি। স্টোরেজ অনুমতি (All files access) দিয়ে অ্যাপ আবার খুলুন';
  return null;
}
