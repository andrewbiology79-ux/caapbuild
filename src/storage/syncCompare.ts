import type { CqScope, Subject, Chapter, Topic, Stimulus, Question, SyncRow } from '../db/db';
import {
  kindOfDepth,
  FOLDER_META,
  DATA_FILE,
  MEDIA_DIR,
  imageIdFromFileName,
  sanitizeFolderName,
  baseOfDirName,
  scopeRoot,
  isReservedDirName,
  isSystemFileName,
  UNNECESSARY_DIR,
  type FolderKind,
  type FolderMeta,
} from './folderLayout';
import { QB_ROOT } from '../utils/storageAccess';

/**
 * ধাপ ২ - সিঙ্কের "খাঁটি" তুলনা (কোনো ফাইল/ডেটাবেস IO নেই)।
 *
 * এই ফাইলের ফাংশনগুলো শুধু হাতে দেওয়া তথ্য নিয়ে হিসাব করে। scanner.ts (আসল ফোল্ডার -> অ্যাপ সিঙ্ক) আর
 * syncPreview.ts (কিছু না লিখে "কী বদলাবে" দেখানো) দুটোই এখানকার একই নিয়ম ব্যবহার করে,
 * যাতে প্রিভিউ আর আসল কাজ একই ফল দেয়।
 */

/* ------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------- */

export interface FolderNode {
  path: string;
  name: string;
  depth: number;
  kind: FolderKind;
  metaText?: string;
  id?: string;
  isNew?: boolean;
  parent?: FolderNode;
  order?: number;
  hasData: boolean;
  dataMtime: number;
  dataSize: number;
  mediaFiles: string[];
  /** ফোল্ডারের ভেতরে অ্যাপ যা চেনে না: বাড়তি ফাইল/ফোল্ডার (name = এই ফোল্ডারের ভেতরের নাম) */
  extraItems?: Array<{ name: string; dir: boolean }>;
  /** media/-র ভেতরে ছবি নয় এমন বাড়তি ফাইল/ফোল্ডার */
  extraMedia?: Array<{ name: string; dir: boolean }>;
}

export interface ImageInfo {
  id: string;
  hasBlob: boolean;
  topicId?: string;
}

/** The app database as plain data */
export interface AppSnapshot {
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  rows: SyncRow[];
  questionsByTopic: Map<string, Question[]>;
  stimuliByTopic: Map<string, Stimulus[]>;
  imageById: Map<string, ImageInfo>;
}

/** Changes the app has queued but not yet written into the folders */
export interface PendingInfo {
  entities: Set<string>;
  deletes: Set<string>;
  topics: Set<string>;
}

export interface FilePayload {
  stimuli: any[];
  questions: any[];
  images: any[];
}

/** data.json content per folder path (only for folders whose file was read) */
export type FileDataMap = Map<string, { payload: FilePayload | null }>;

export type ChangeAction = 'add' | 'rename' | 'move' | 'delete' | 'update' | 'create' | 'info';

export interface QItem {
  id: string;
  type: string;
  title: string;
}

export interface TopicDiff {
  questionsAdded: QItem[];
  questionsRemoved: QItem[];
  questionsChanged: QItem[];
  stimuliAdded: number;
  stimuliRemoved: number;
  stimuliChanged: number;
  /** picture files found in media/ that the app does not know */
  imagesNew: number;
  /** pictures the app knows (file based) but whose file is not in media/ */
  imagesMissing: string[];
  /** pictures that will be written into media/ (app -> folder) */
  imagesToWrite: number;
}

export interface PreviewEntry {
  scope: CqScope;
  kind: FolderKind;
  action: ChangeAction;
  /** names from the subject down to this item */
  path: string[];
  from?: string;
  to?: string;
  note?: string;
  topic?: TopicDiff;
  /** deletes data / cannot be undone from the app side */
  destructive?: boolean;
}

/** কনফ্লিক্টের কোনো ধরন এখন আর তৈরি হয় না (কপি করা ফোল্ডারও unnecessary/-তে যায়); ধরনটা শুধু পুরোনো কোডের সঙ্গে মেলানোর জন্য */
export type ConflictKind = 'duplicate-id';

export interface ConflictEntry {
  scope: CqScope;
  kind: ConflictKind;
  /** names from the subject down to the item */
  path: string[];
  folderSide: string;
  appSide: string;
  /** where the losing copy is moved (Sync_Conflicts/...) */
  moveTo: string;
  /** real folder / file path (relative to the scope root) that gets moved */
  sourcePath: string;
}

/**
 * বাড়তি (অপ্রয়োজনীয়) জিনিস - কনফ্লিক্ট নয়। মোছা হয় না; নিজের টাইপ/অধ্যায় ফোল্ডারের ভেতরে
 * unnecessary/ ফোল্ডারে সরে যায় (media/-র ছবি -> unnecessary/media/...)।
 */
export type ExtraKind = 'extra-folder' | 'extra-file' | 'extra-media';

export interface ExtraEntry {
  scope: CqScope;
  kind: ExtraKind;
  /** যে ফোল্ডারের ভেতরে জিনিসটা আছে (বিষয় থেকে নিচের নাম; স্কোপ রুট হলে খালি) */
  owner: string[];
  /** owner-এর ভেতরের পথ, যেমন "media/abc.webp" */
  name: string;
  /** owner + name (দেখানোর জন্য) */
  path: string[];
  folderSide: string;
  /** ফোল্ডারে আছে এমন জায়গা, স্কোপ রুটের সাপেক্ষে */
  sourcePath: string;
  /** সরে যাবে যেখানে: <owner>/unnecessary/<name> (পুরো পথ) */
  moveTo: string;
}

export interface CompareResult {
  entries: PreviewEntry[];
  conflicts: ConflictEntry[];
  extras: ExtraEntry[];
  warnings: string[];
  /** folders -> app only: more than half of the folders look deleted (the scan asks before deleting) */
  massDelete?: { count: number; total: number };
}

export const SCOPE_LABEL: Record<CqScope, string> = { type: 'Type_CQ', chapter: 'Chapter_CQ' };

/* ------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------- */

const DEFAULT_MARKS: Record<string, number> = { 'ক': 1, 'খ': 2, 'গ': 3, 'ঘ': 4 };

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

export function normStimulus(s: any, topicId: string, id: string): Stimulus {
  const imageIds: string[] = Array.isArray(s?.imageIds) ? s.imageIds.filter((x: any) => typeof x === 'string') : [];
  return {
    ...s,
    id,
    topicId,
    text: typeof s?.text === 'string' ? s.text : '',
    imageIds,
    usedInBoards: Array.isArray(s?.usedInBoards) ? s.usedInBoards : [],
  };
}

export function normQuestion(q: any, index: number, topicId: string, id: string, stimulusId?: string): Question {
  const type = ['ক', 'খ', 'গ', 'ঘ'].includes(q?.type) ? q.type : 'ক';
  const marks = Number(q?.marks);
  const rating = Number(q?.rating);
  const order = Number(q?.order);
  return {
    ...q,
    id,
    topicId,
    stimulusId,
    type,
    marks: Number.isFinite(marks) && marks > 0 ? marks : DEFAULT_MARKS[type] ?? 1,
    questionText: typeof q?.questionText === 'string' ? q.questionText : '',
    solutionText: typeof q?.solutionText === 'string' ? q.solutionText : '',
    solutionImageIds: Array.isArray(q?.solutionImageIds) ? q.solutionImageIds.filter((x: any) => typeof x === 'string') : [],
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : 3,
    order: Number.isFinite(order) ? order : index + 1,
    usedInBoards: Array.isArray(q?.usedInBoards) ? q.usedInBoards : [],
  };
}

export function parseMeta(text: string | undefined, kind: FolderKind): FolderMeta | null {
  if (!text) return null;
  try {
    const m = JSON.parse(text);
    if (m && typeof m.id === 'string' && m.id && m.kind === kind) return m as FolderMeta;
  } catch {
    /* ignore */
  }
  return null;
}

/** Same JSON for the same content, whatever the key order; `undefined` values are dropped like JSON.stringify does */
export function stableStringify(v: any): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((x) => stableStringify(x)).join(',') + ']';
  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

const IMG_MARKER_RE = /\[\[img:([^\]\s]+)\]\]/g;

/** Every picture id a type's stimuli / questions use (ids field + [[img:ID]] markers in the texts) */
export function collectImageIds(stimuli: Stimulus[], questions: Question[]): string[] {
  const ids = new Set<string>();
  const fromText = (t?: string | null) => {
    if (!t) return;
    const re = new RegExp(IMG_MARKER_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) ids.add(m[1]);
  };
  for (const s of stimuli) {
    (s.imageIds || []).forEach((i) => ids.add(i));
    fromText(s.text);
  }
  for (const q of questions) {
    (q.solutionImageIds || []).forEach((i) => ids.add(i));
    fromText(q.solutionText);
    fromText(q.questionText);
    fromText(q.answerText);
  }
  return Array.from(ids);
}

/** "2026-11-10_14-30-05" - names the Sync_Conflicts/<stamp> folder */
export function makeStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Download/QB Collection/Sync_Conflicts/<stamp>/<Type_CQ|Chapter_CQ>/<original relative path> */
export function conflictDestination(stamp: string, scope: CqScope, relPath: string): string {
  return `${QB_ROOT}/Sync_Conflicts/${stamp}/${SCOPE_LABEL[scope]}/${relPath}`;
}

/** <scope>/<owner>/unnecessary/<name> - owner খালি হলে স্কোপ রুটের নিচে */
export function unnecessaryDestination(scope: CqScope, ownerPath: string, name: string): string {
  return [scopeRoot(scope), ownerPath, UNNECESSARY_DIR, name].filter(Boolean).join('/');
}

/** unnecessary/-র ভেতরের যে উপ-ফোল্ডারে কপি করা ফোল্ডার জমে */
export const CONFLICT_SUBDIR = 'Sync_Conflicts';

function makeExtra(scope: CqScope, kind: ExtraKind, ownerPath: string, name: string, folderSide: string): ExtraEntry {
  const owner = ownerPath ? ownerPath.split('/') : [];
  return {
    scope,
    kind,
    owner,
    name,
    path: [...owner, ...name.split('/')],
    folderSide,
    sourcePath: ownerPath ? `${ownerPath}/${name}` : name,
    moveTo: unnecessaryDestination(scope, ownerPath, name),
  };
}

/** একটি ফোল্ডারের ভেতরের বাড়তি ফাইল/ফোল্ডার + media/-র ভেতরের ছবি-নয় এমন জিনিস */
export function extrasOfNode(scope: CqScope, n: FolderNode): ExtraEntry[] {
  const out: ExtraEntry[] = [];
  for (const it of n.extraItems ?? []) {
    out.push(makeExtra(scope, it.dir ? 'extra-folder' : 'extra-file', n.path, it.name, it.dir ? `বাড়তি ফোল্ডার: ${it.name}` : `বাড়তি ফাইল: ${it.name}`));
  }
  for (const it of n.extraMedia ?? []) {
    out.push(makeExtra(scope, 'extra-media', n.path, `${MEDIA_DIR}/${it.name}`, `media/-তে বাড়তি ${it.dir ? 'ফোল্ডার' : 'ফাইল'}: ${it.name}`));
  }
  return out;
}

/** অ্যাপ চেনে না এমন পুরো ফোল্ডার (বাবার ভেতরের unnecessary/-তে যায়) */
export function extraFolderEntry(scope: CqScope, n: FolderNode): ExtraEntry {
  const cut = n.path.lastIndexOf('/');
  const ownerPath = cut < 0 ? '' : n.path.slice(0, cut);
  return makeExtra(scope, 'extra-folder', ownerPath, n.name, `ফোল্ডারে আছে: ${n.path.split('/').join(' › ')} (অ্যাপে নেই)`);
}

/** কপি করা ফোল্ডার (একই id): বাবার unnecessary/Sync_Conflicts/<নাম>-এ যায় (সরায়, মোছে না) */
export function copiedFolderEntry(scope: CqScope, n: FolderNode, folderSide: string): ExtraEntry {
  const ex = extraFolderEntry(scope, n);
  const cut = n.path.lastIndexOf('/');
  const ownerPath = cut < 0 ? '' : n.path.slice(0, cut);
  ex.moveTo = unnecessaryDestination(scope, ownerPath, `${CONFLICT_SUBDIR}/${n.name}`);
  ex.folderSide = folderSide;
  return ex;
}

/** media/-র যেসব ছবির ফাইল কেউ ব্যবহার করে না (known = অ্যাপ/data.json যেসব ছবির id চেনে) */
export function extraImageEntries(scope: CqScope, n: FolderNode, known: Set<string>): ExtraEntry[] {
  const out: ExtraEntry[] = [];
  for (const f of n.mediaFiles) {
    const id = imageIdFromFileName(f);
    if (id && known.has(id)) continue;
    out.push(makeExtra(scope, 'extra-media', n.path, `${MEDIA_DIR}/${f}`, `media/-তে বাড়তি ছবি: ${f}`));
  }
  return out;
}

/* ------------------------------------------------------------------
 * Folder tree
 * ---------------------------------------------------------------- */

/** Build the folder tree from the flat native listing */
export function buildNodes(scope: CqScope, entries: Array<{ p: string; d: boolean; s: number; m: number; t?: string }>): FolderNode[] {
  const maxDepth = scope === 'type' ? 3 : 2;
  const nodes = new Map<string, FolderNode>();

  const getNode = (path: string): FolderNode | null => {
    let n = nodes.get(path);
    if (n) return n;
    const parts = path.split('/');
    const kind = kindOfDepth(scope, parts.length);
    if (!kind) return null;
    n = { path, name: parts[parts.length - 1], depth: parts.length, kind, hasData: false, dataMtime: 0, dataSize: 0, mediaFiles: [], extraItems: [], extraMedia: [] };
    nodes.set(path, n);
    return n;
  };

  for (const e of entries) {
    const parts = e.p.split('/');
    const last = parts[parts.length - 1];
    const dirParts = e.d ? parts : parts.slice(0, -1);
    // hidden folders and the "unnecessary" folder are not part of the bank
    if (dirParts.some((x) => x.startsWith('.') || isReservedDirName(x))) continue;

    if (e.d) {
      if (parts.length <= maxDepth) {
        getNode(e.p);
      } else if (parts.length === maxDepth + 1) {
        // a folder inside a type / chapter folder: only media/ is known, the rest is extra
        if (last !== MEDIA_DIR) getNode(parts.slice(0, -1).join('/'))?.extraItems?.push({ name: last, dir: true });
      } else if (parts.length === maxDepth + 2 && parts[maxDepth] === MEDIA_DIR) {
        getNode(parts.slice(0, maxDepth).join('/'))?.extraMedia?.push({ name: last, dir: true });
      }
      continue;
    }

    // a file
    const parentParts = parts.slice(0, -1);
    if (parentParts.length === 0) continue;

    if (parentParts.length <= maxDepth) {
      const n = getNode(parentParts.join('/'));
      if (!n) continue;
      if (last === FOLDER_META) n.metaText = e.t;
      else if (last === DATA_FILE && parentParts.length === maxDepth) {
        n.hasData = true;
        n.dataMtime = e.m;
        n.dataSize = e.s;
      } else if (!isSystemFileName(last)) {
        n.extraItems?.push({ name: last, dir: false });
      }
    } else if (parentParts.length === maxDepth + 1 && parentParts[parentParts.length - 1] === MEDIA_DIR) {
      const n = getNode(parentParts.slice(0, -1).join('/'));
      if (!n) continue;
      if (imageIdFromFileName(last)) n.mediaFiles.push(last);
      else if (!isSystemFileName(last)) n.extraMedia?.push({ name: last, dir: false });
    }
  }

  // parents
  for (const n of nodes.values()) {
    if (n.depth > 1) n.parent = nodes.get(n.path.split('/').slice(0, -1).join('/'));
  }
  return Array.from(nodes.values()).sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}

/**
 * Give every folder its id (from .folder.json).
 * A folder that was COPIED in the file manager carries the same id twice: the one that still has the
 * name we know stays the original, the other one becomes a NEW item. A folder without a readable
 * .folder.json is new as well. `orderMax` (parent id -> highest order in use) is updated for new items.
 */
export function identifyNodes(
  nodes: FolderNode[],
  rowById: Map<string, SyncRow>,
  orderMax: Map<string, number>,
  genId: () => string = newId
): { dupNodes: Set<FolderNode>; diskIds: Set<string> } {
  const bump = (key: string, order: number) => orderMax.set(key, Math.max(orderMax.get(key) ?? 0, order || 0));

  const byId = new Map<string, FolderNode[]>();
  for (const n of nodes) {
    const meta = parseMeta(n.metaText, n.kind);
    if (!meta) continue;
    n.id = meta.id;
    n.order = Number.isFinite(meta.order) ? meta.order : undefined;
    const list = byId.get(meta.id) ?? [];
    list.push(n);
    byId.set(meta.id, list);
  }
  const dupNodes = new Set<FolderNode>();
  for (const [id, list] of byId) {
    if (list.length < 2) continue;
    const known = rowById.get(id)?.dirName;
    const keeper = list.find((n) => n.name === known) ?? list[0];
    for (const n of list) if (n !== keeper) dupNodes.add(n);
  }
  for (const n of nodes) {
    if (!n.id || dupNodes.has(n)) {
      n.id = genId();
      n.isNew = true;
    }
  }
  for (const n of nodes) {
    if (n.isNew) {
      const key = n.parent?.id ?? '';
      n.order = (orderMax.get(key) ?? 0) + 1;
      bump(key, n.order);
    }
  }
  return { dupNodes, diskIds: new Set(nodes.map((n) => n.id as string)) };
}

/** Folders the app knows (rows) that are gone from the disk; `massive` = the scan asks before deleting them */
export function findDeletedRows(rows: SyncRow[], diskIds: Set<string>): { deleted: SyncRow[]; total: number; massive: boolean } {
  const folderRows = rows.filter((r) => r.kind !== 'data' && r.dirName);
  const deleted = folderRows.filter((r) => !diskIds.has(r.id));
  const massive = deleted.length >= 3 && deleted.length / Math.max(1, folderRows.length) > 0.5;
  return { deleted, total: folderRows.length, massive };
}

/* ------------------------------------------------------------------
 * Question / stimulus comparison
 * ---------------------------------------------------------------- */

const asJson = (v: any): string => stableStringify(JSON.parse(JSON.stringify(v)));

function titleOf(q: Question): string {
  const t = (q.questionText || '').replace(/\s+/g, ' ').trim();
  return t.length > 48 ? t.slice(0, 48) + '…' : t || '(লেখা নেই)';
}

const toItem = (q: Question): QItem => ({ id: q.id, type: q.type, title: titleOf(q) });

/** What the folder's data.json holds, in the same shape as the app's rows (invalid items dropped like the scan does) */
export function normalizePayload(payload: FilePayload, topicId: string): { stimuli: Stimulus[]; questions: Question[] } {
  const stimuli: Stimulus[] = [];
  const stimIds = new Set<string>();
  for (const s of payload.stimuli) {
    if (!s || typeof s.id !== 'string') continue;
    stimuli.push(normStimulus(s, topicId, s.id));
    stimIds.add(s.id);
  }
  const questions: Question[] = [];
  payload.questions.forEach((q: any, i: number) => {
    if (!q || typeof q.id !== 'string') return;
    questions.push(normQuestion(q, i, topicId, q.id, q.stimulusId || undefined));
  });
  return { stimuli, questions };
}

export interface SetDiff {
  questionsAdded: QItem[];
  questionsRemoved: QItem[];
  questionsChanged: QItem[];
  stimuliAdded: number;
  stimuliRemoved: number;
  stimuliChanged: number;
}

export function emptySetDiff(): SetDiff {
  return { questionsAdded: [], questionsRemoved: [], questionsChanged: [], stimuliAdded: 0, stimuliRemoved: 0, stimuliChanged: 0 };
}

export function hasSetDiff(d: SetDiff): boolean {
  return (
    d.questionsAdded.length + d.questionsRemoved.length + d.questionsChanged.length + d.stimuliAdded + d.stimuliRemoved + d.stimuliChanged > 0
  );
}

/**
 * source -> target: "added" = in source only, "removed" = in target only, "changed" = in both but different.
 * (folder -> app: source = data.json, target = app. app -> folder: source = app, target = data.json.)
 */
export function diffContent(
  source: { stimuli: Stimulus[]; questions: Question[] },
  target: { stimuli: Stimulus[]; questions: Question[] }
): SetDiff {
  const out = emptySetDiff();
  const tq = new Map(target.questions.map((q) => [q.id, q]));
  const sq = new Map(source.questions.map((q) => [q.id, q]));
  for (const q of source.questions) {
    const other = tq.get(q.id);
    if (!other) out.questionsAdded.push(toItem(q));
    else if (asJson(q) !== asJson(other)) out.questionsChanged.push(toItem(q));
  }
  for (const q of target.questions) if (!sq.has(q.id)) out.questionsRemoved.push(toItem(q));

  const ts = new Map(target.stimuli.map((s) => [s.id, s]));
  const ss = new Map(source.stimuli.map((s) => [s.id, s]));
  for (const s of source.stimuli) {
    const other = ts.get(s.id);
    if (!other) out.stimuliAdded++;
    else if (asJson(s) !== asJson(other)) out.stimuliChanged++;
  }
  for (const s of target.stimuli) if (!ss.has(s.id)) out.stimuliRemoved++;
  return out;
}

/* ------------------------------------------------------------------
 * Shared lookups
 * ---------------------------------------------------------------- */

interface Names {
  subject: Map<string, string>;
  chapter: Map<string, string>;
  topic: Map<string, string>;
}

function namesOf(app: AppSnapshot): Names {
  return {
    subject: new Map(app.subjects.map((s) => [s.id, s.name])),
    chapter: new Map(app.chapters.map((c) => [c.id, c.name])),
    topic: new Map(app.topics.map((t) => [t.id, t.name])),
  };
}

/** Names from the subject down to a folder node (folder names - what the person sees in the file manager) */
function nodePathNames(n: FolderNode): string[] {
  return n.path.split('/');
}

const nodeLabel = (n: FolderNode): string => nodePathNames(n).join(' › ');

/** Chapter CQ keeps its questions in the hidden default topic: the first topic of the chapter */
export function defaultTopicOf(topics: Topic[], chapterId: string): Topic | undefined {
  return topics.filter((t) => t.chapterId === chapterId).sort((a, b) => a.order - b.order)[0];
}

/** The topic that holds the questions of a type / chapter folder (Type CQ: the folder itself, Chapter CQ: the chapter's hidden default topic) */
export function topicIdOfDataNode(scope: CqScope, n: FolderNode, topics: Topic[]): string {
  if (scope === 'type') return n.id as string;
  return defaultTopicOf(topics, n.id as string)?.id ?? '';
}

function countBelow(app: AppSnapshot, kind: FolderKind, id: string): { chapters: number; topics: number; questions: number } {
  const out = { chapters: 0, topics: 0, questions: 0 };
  const addTopic = (tid: string) => {
    out.topics++;
    out.questions += app.questionsByTopic.get(tid)?.length ?? 0;
  };
  if (kind === 'topic') {
    out.topics = 0;
    out.questions = app.questionsByTopic.get(id)?.length ?? 0;
    return out;
  }
  const chapters = kind === 'subject' ? app.chapters.filter((c) => c.subjectId === id) : app.chapters.filter((c) => c.id === id);
  if (kind === 'subject') out.chapters = chapters.length;
  for (const c of chapters) for (const t of app.topics.filter((t) => t.chapterId === c.id)) addTopic(t.id);
  return out;
}

function describeBelow(c: { chapters: number; topics: number; questions: number }): string {
  const parts: string[] = [];
  if (c.chapters) parts.push(`${c.chapters}টি অধ্যায়`);
  if (c.topics) parts.push(`${c.topics}টি টাইপ`);
  parts.push(`${c.questions}টি প্রশ্ন`);
  return 'ভেতরে ' + parts.join(', ');
}

function imageDiff(
  node: FolderNode | undefined,
  topicId: string,
  app: AppSnapshot,
  skipFiles?: Set<string>
): { imagesNew: number; imagesMissing: string[] } {
  if (!node) return { imagesNew: 0, imagesMissing: [] };
  // বাড়তি ছবি (unnecessary-তে যাবে) "নতুন ছবি" নয়
  const fileIds = new Set(node.mediaFiles.filter((f) => !skipFiles?.has(f)).map((f) => imageIdFromFileName(f) as string));
  let imagesNew = 0;
  for (const id of fileIds) if (!app.imageById.has(id)) imagesNew++;
  // only pictures the type still uses can be "missing" (a leftover record of a replaced / deleted picture is not)
  const used = new Set(collectImageIds(app.stimuliByTopic.get(topicId) ?? [], app.questionsByTopic.get(topicId) ?? []));
  const imagesMissing: string[] = [];
  for (const img of app.imageById.values()) {
    if (img.topicId === topicId && used.has(img.id) && !img.hasBlob && !fileIds.has(img.id)) imagesMissing.push(img.id);
  }
  return { imagesNew, imagesMissing };
}

function toTopicDiff(d: SetDiff, img: { imagesNew: number; imagesMissing: string[] }, imagesToWrite = 0): TopicDiff {
  return { ...d, imagesNew: img.imagesNew, imagesMissing: img.imagesMissing, imagesToWrite };
}

const topicHasChange = (t: TopicDiff): boolean => hasSetDiff(t) || t.imagesToWrite > 0;

/* ------------------------------------------------------------------
 * folder -> app
 * ---------------------------------------------------------------- */

export interface FolderToAppInput {
  scope: CqScope;
  stamp: string;
  nodes: FolderNode[];
  app: AppSnapshot;
  /** data.json of folders that need reading (see needsDataRead) */
  fileData: FileDataMap;
  pending: PendingInfo;
}

/** Same test the scan uses to decide whether a folder's data.json has to be read */
export function needsDataRead(n: FolderNode, isDup: boolean, dataRow: SyncRow | undefined): boolean {
  return n.hasData && (isDup || !!n.isNew || !dataRow || dataRow.mtime !== n.dataMtime || dataRow.size !== n.dataSize);
}

export function compareFolderToApp(input: FolderToAppInput): CompareResult {
  const { scope, stamp, nodes, app, fileData, pending } = input;
  const res: CompareResult = { entries: [], conflicts: [], extras: [], warnings: [] };
  const names = namesOf(app);
  const rowById = new Map(app.rows.map((r) => [r.id, r]));
  const subjectById = new Map(app.subjects.map((s) => [s.id, s]));
  const chapterById = new Map(app.chapters.map((c) => [c.id, c]));
  const topicById = new Map(app.topics.map((t) => [t.id, t]));

  const orderMax = new Map<string, number>();
  const bump = (key: string, order: number) => orderMax.set(key, Math.max(orderMax.get(key) ?? 0, order || 0));
  app.subjects.forEach((s) => bump('', s.order));
  app.chapters.forEach((c) => bump(c.subjectId, c.order));
  app.topics.forEach((t) => bump(t.chapterId, t.order));

  const { dupNodes, diskIds } = identifyNodes(nodes, rowById, orderMax);

  // ---- copied folders (same id twice) are not conflicts: the copy goes to unnecessary/ (never deleted) ----
  const nodeById = new Map<string, FolderNode>();
  for (const n of nodes) if (!dupNodes.has(n)) nodeById.set(n.id as string, n);
  for (const n of dupNodes) {
    const keeperId = parseMeta(n.metaText, n.kind)?.id;
    const keeper = keeperId ? nodeById.get(keeperId) : undefined;
    res.extras.push(copiedFolderEntry(scope, n, `কপি করা ফোল্ডার: ${nodeLabel(n)}${keeper ? ` (মূল: ${nodeLabel(keeper)})` : ''}`));
  }
  // everything inside a copied folder travels with it
  const insideDup = (n: FolderNode): boolean => {
    for (let p: FolderNode | undefined = n; p; p = p.parent) if (dupNodes.has(p)) return true;
    return false;
  };

  // ---- deleted folders ----
  const { deleted, total, massive } = findDeletedRows(app.rows, diskIds);
  const deletedRows = deleted.filter((r) => !pending.deletes.has(r.id));
  if (massive) res.massDelete = { count: deletedRows.length, total };
  const deletedIds = new Set(deletedRows.map((r) => r.id));
  const pathOfRow = (r: SyncRow): string[] => {
    const parts: string[] = [];
    let cur: SyncRow | undefined = r;
    let guard = 0;
    while (cur && guard++ < 6) {
      if (cur.dirName) parts.unshift(cur.dirName);
      cur = cur.parentId ? rowById.get(cur.parentId) : undefined;
    }
    return parts;
  };
  for (const r of deletedRows) {
    if (r.parentId && deletedIds.has(r.parentId)) continue; // listed through its parent
    const kind = r.kind as FolderKind;
    const below = countBelow(app, kind, r.id);
    res.entries.push({
      scope,
      kind,
      action: 'delete',
      path: pathOfRow(r),
      from: r.dirName,
      note: describeBelow(below),
      destructive: true,
    });
  }

  // ---- folders -> subjects / chapters / types ----
  for (const n of nodes) {
    if (insideDup(n)) continue;
    const id = n.id as string;
    const parentId = n.parent?.id as string | undefined;
    if (pending.deletes.has(id)) continue; // the app is deleting it right now
    const appWins = pending.entities.has(id); // renamed / moved in the app, not written yet
    const path = nodePathNames(n);

    if (n.kind === 'subject') {
      const ent = subjectById.get(id);
      if (!ent) {
        if (rowById.has(id) && !n.isNew) continue;
        res.entries.push({ scope, kind: 'subject', action: 'add', path });
      } else if (!appWins) {
        const row = rowById.get(id);
        if (row && row.dirName !== n.name) res.entries.push({ scope, kind: 'subject', action: 'rename', path, from: ent.name, to: n.name });
      }
    } else if (n.kind === 'chapter') {
      if (!parentId) continue;
      const ent = chapterById.get(id);
      if (!ent) {
        if (rowById.has(id) && !n.isNew) continue;
        res.entries.push({ scope, kind: 'chapter', action: 'add', path });
      } else if (!appWins) {
        const row = rowById.get(id);
        if (row && row.dirName !== n.name) res.entries.push({ scope, kind: 'chapter', action: 'rename', path, from: ent.name, to: n.name });
        if (ent.subjectId !== parentId) {
          res.entries.push({ scope, kind: 'chapter', action: 'move', path, from: names.subject.get(ent.subjectId) ?? '?', to: n.parent?.name });
        }
      }
    } else {
      if (!parentId) continue;
      const ent = topicById.get(id);
      if (!ent) {
        if (rowById.has(id) && !n.isNew) continue;
        res.entries.push({ scope, kind: 'topic', action: 'add', path });
      } else if (!appWins) {
        const row = rowById.get(id);
        if (row && row.dirName !== n.name) res.entries.push({ scope, kind: 'topic', action: 'rename', path, from: ent.name, to: n.name });
        if (ent.chapterId !== parentId) {
          res.entries.push({ scope, kind: 'topic', action: 'move', path, from: names.chapter.get(ent.chapterId) ?? '?', to: n.parent?.name });
        }
      }
    }
  }

  // ---- same name, different item: a new / renamed folder takes the name another app item (same parent) already has -> "name (2)" ----
  for (const n of nodes) {
    if (insideDup(n)) continue;
    const id = n.id as string;
    const parentId = n.parent?.id as string | undefined;
    const row = rowById.get(id);
    if (!(n.isNew || (row && row.dirName !== n.name))) continue;
    const sameParent: Array<{ id: string; name: string }> =
      n.kind === 'subject'
        ? app.subjects.map((s) => ({ id: s.id, name: s.name }))
        : n.kind === 'chapter'
          ? app.chapters.filter((c) => c.subjectId === parentId).map((c) => ({ id: c.id, name: c.name }))
          : app.topics.filter((t) => t.chapterId === parentId).map((t) => ({ id: t.id, name: t.name }));
    const clash = sameParent.find((x) => {
      if (x.id === id || deletedIds.has(x.id)) return false;
      if (x.name.toLowerCase() !== n.name.toLowerCase()) return false;
      const other = nodeById.get(x.id);
      // the other item is being renamed in the folders too -> no clash
      if (other && baseOfDirName(other.name).toLowerCase() !== x.name.toLowerCase()) return false;
      return true;
    });
    if (!clash) continue;
    // not a conflict: the folder item comes into the app as "name (2)" (the scan picks the free number)
    res.entries.push({
      scope,
      kind: n.kind,
      action: 'info',
      path: nodePathNames(n),
      note: `অ্যাপে "${clash.name}" নামে আরেকটি আছে - এটা "${n.name} (2)" নামে আসবে`,
    });
  }

  // ---- extras: files / folders / pictures the app does not need -> unnecessary/ (never a conflict, never deleted) ----
  const skipImages = new Map<string, Set<string>>(); // folder path -> media file names that are extra
  for (const n of nodes) {
    if (insideDup(n) || pending.deletes.has(n.id as string)) continue;
    res.extras.push(...extrasOfNode(scope, n));
  }
  const leafDepth = scope === 'type' ? 3 : 2;
  for (const n of nodes) {
    if (n.depth !== leafDepth || insideDup(n) || !n.mediaFiles.length || pending.deletes.has(n.id as string)) continue;
    const tid = topicIdOfDataNode(scope, n, app.topics);
    const tKnown = !!tid && topicById.has(tid);
    if (!n.hasData && !tKnown) continue; // nothing to judge the pictures by yet
    const fileRead = fileData.get(n.path);
    if (n.hasData && fileRead && !fileRead.payload) continue; // damaged data.json: cannot judge
    // only pictures the type's questions / stimuli use are needed (not every picture the app's image table still holds)
    const known = new Set<string>();
    if (tKnown) collectImageIds(app.stimuliByTopic.get(tid) ?? [], app.questionsByTopic.get(tid) ?? []).forEach((i) => known.add(i));
    if (fileRead?.payload) {
      const fs = normalizePayload(fileRead.payload, tid || '_new');
      collectImageIds(fs.stimuli, fs.questions).forEach((i) => known.add(i));
    }
    const ex = extraImageEntries(scope, n, known);
    if (!ex.length) continue;
    res.extras.push(...ex);
    skipImages.set(n.path, new Set(ex.map((e) => e.name.slice(MEDIA_DIR.length + 1))));
  }

  // ---- data.json of every type / chapter folder ----
  const dataDepth = scope === 'type' ? 3 : 2;
  for (const n of nodes) {
    if (n.depth !== dataDepth || insideDup(n)) continue;
    const id = n.id as string;
    const chapterNode = scope === 'type' ? n.parent : n;
    const chapterId = chapterNode?.id as string | undefined;
    if (!chapterId) continue;

    const topicId = topicIdOfDataNode(scope, n, app.topics);
    const topicKnown = !!topicId && topicById.has(topicId);
    const dataRow = topicId ? rowById.get(`data:${topicId}`) : undefined;
    const path = nodePathNames(n);
    const entryKind: FolderKind = scope === 'type' ? 'topic' : 'chapter';
    const topicPending = !!topicId && pending.topics.has(topicId);

    // the app writes straight into the folder, so a pending write is just the app's own change on its way - no conflict kind exists for it
    if (topicPending) continue; // plain app -> folder write, not a folder change

    if (!n.hasData) {
      if (topicKnown) {
        const q = app.questionsByTopic.get(topicId)?.length ?? 0;
        res.entries.push({ scope, kind: entryKind, action: 'info', path, note: `data.json নেই - অ্যাপের ${q}টি প্রশ্ন থেকে আবার লেখা হবে` });
      }
      continue;
    }

    if (!needsDataRead(n, false, dataRow) && !n.isNew) {
      // file untouched since the last sync - only report missing picture files (the scan does not drop them)
      const img = imageDiff(n, topicId, app, skipImages.get(n.path));
      if (img.imagesMissing.length) {
        res.entries.push({
          scope,
          kind: entryKind,
          action: 'info',
          path,
          note: `${img.imagesMissing.length}টি ছবির ফাইল media/ ফোল্ডারে নেই (অ্যাপে রেকর্ড থেকে যাবে)`,
          topic: toTopicDiff(emptySetDiff(), img),
        });
      }
      continue;
    }

    const read = fileData.get(n.path);
    if (!read || !read.payload) {
      res.warnings.push(`${n.path}/${DATA_FILE} পড়া যায়নি (ফাইলে ভুল আছে) - আগের তথ্য রাখা হবে`);
      continue;
    }
    const fileSide = normalizePayload(read.payload, topicId || '_new');
    const appSide = topicKnown
      ? { stimuli: app.stimuliByTopic.get(topicId) ?? [], questions: app.questionsByTopic.get(topicId) ?? [] }
      : { stimuli: [], questions: [] };
    const diff = diffContent(fileSide, appSide);
    const img = imageDiff(n, topicId, app, skipImages.get(n.path));
    const td = toTopicDiff(diff, img);
    if (hasSetDiff(diff) || img.imagesMissing.length || img.imagesNew) {
      res.entries.push({
        scope,
        kind: entryKind,
        action: hasSetDiff(diff) || img.imagesNew ? 'update' : 'info',
        path,
        topic: td,
        destructive: diff.questionsRemoved.length > 0,
        note: hasSetDiff(diff) || img.imagesNew ? undefined : `${img.imagesMissing.length}টি ছবির ফাইল media/ ফোল্ডারে নেই`,
      });
    }
  }

  return res;
}

/* ------------------------------------------------------------------
 * app -> folder
 * ---------------------------------------------------------------- */

export interface AppToFolderInput {
  scope: CqScope;
  stamp: string;
  nodes: FolderNode[];
  app: AppSnapshot;
  /** data.json of EVERY folder (read in full - this direction needs the exact difference) */
  fileData: FileDataMap;
}

export function compareAppToFolder(input: AppToFolderInput): CompareResult {
  const { scope, stamp, nodes, app, fileData } = input;
  const res: CompareResult = { entries: [], conflicts: [], extras: [], warnings: [] };
  const rowById = new Map(app.rows.map((r) => [r.id, r]));
  const orderMax = new Map<string, number>();
  const { dupNodes } = identifyNodes(nodes, rowById, orderMax);
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  const nodeById = new Map<string, FolderNode>();
  for (const n of nodes) if (!dupNodes.has(n) && !n.isNew) nodeById.set(n.id as string, n);

  const subjectById = new Map(app.subjects.map((s) => [s.id, s]));
  const chapterById = new Map(app.chapters.map((c) => [c.id, c]));

  /** Which folder holds this item (found by id, else by the folder name the app remembers) */
  const rowPath = (id: string): string | null => {
    const parts: string[] = [];
    let cur = rowById.get(id);
    let guard = 0;
    while (cur && guard++ < 6) {
      if (cur.dirName) parts.unshift(cur.dirName);
      if (cur.kind === 'subject') return parts.join('/');
      cur = cur.parentId ? rowById.get(cur.parentId) : undefined;
    }
    return null;
  };
  const nodeFor = (id: string): FolderNode | undefined => {
    const byId = nodeById.get(id);
    if (byId) return byId;
    const p = rowPath(id);
    return p ? nodeByPath.get(p) : undefined;
  };

  /** names from the subject down (what the app calls the items) */
  const appPathOf = (kind: FolderKind, id: string): string[] => {
    if (kind === 'subject') return [subjectById.get(id)?.name ?? '?'];
    if (kind === 'chapter') {
      const c = chapterById.get(id);
      return [...(c ? appPathOf('subject', c.subjectId) : ['?']), c?.name ?? '?'];
    }
    const t = app.topics.find((x) => x.id === id);
    return [...(t ? appPathOf('chapter', t.chapterId) : ['?']), t?.name ?? '?'];
  };

  const matched = new Set<FolderNode>();

  // ---- subjects / chapters / types: create, rename, move ----
  const checkEntity = (kind: FolderKind, ent: { id: string; name: string }, parentId: string | undefined) => {
    const id = ent.id;
    const row = rowById.get(id);
    const path = appPathOf(kind, id);
    const node = nodeFor(id);
    if (node) matched.add(node);
    if (!row) {
      res.entries.push({ scope, kind, action: 'create', path, note: 'ফোল্ডার তৈরি হবে' });
      return;
    }
    if (!node) {
      res.entries.push({ scope, kind, action: 'create', path, note: 'ফোল্ডার নেই - আবার তৈরি হবে' });
      return;
    }
    const desired = sanitizeFolderName(ent.name);
    const parentMoved = row.parentId !== parentId;
    const nameOk = row.dirName === desired || baseOfDirName(row.dirName || '') === desired;
    if (parentMoved) res.entries.push({ scope, kind, action: 'move', path, from: node.parent?.name, note: 'ফোল্ডার নতুন জায়গায় সরবে' });
    if (!nameOk) res.entries.push({ scope, kind, action: 'rename', path, from: row.dirName, to: desired });
    else if (node.name !== row.dirName) res.entries.push({ scope, kind, action: 'rename', path, from: node.name, to: row.dirName, note: 'ফোল্ডারের নাম অ্যাপের সাথে মেলানো হবে' });
  };
  for (const s of app.subjects) checkEntity('subject', s, undefined);
  for (const c of app.chapters) checkEntity('chapter', c, c.subjectId);
  if (scope === 'type') for (const t of app.topics) checkEntity('topic', t, t.chapterId);

  // ---- data.json + media for every type / chapter ----
  const dataItems: Array<{ topicId: string; ownerId: string; kind: FolderKind }> =
    scope === 'type'
      ? app.topics.map((t) => ({ topicId: t.id, ownerId: t.id, kind: 'topic' as FolderKind }))
      : app.chapters.flatMap((c) => {
          const t = defaultTopicOf(app.topics, c.id);
          return t ? [{ topicId: t.id, ownerId: c.id, kind: 'chapter' as FolderKind }] : [];
        });

  const nodeOfTopicId = new Map<string, FolderNode | undefined>();
  for (const it of dataItems) nodeOfTopicId.set(it.topicId, nodeFor(it.ownerId));

  for (const it of dataItems) {
    const node = nodeOfTopicId.get(it.topicId);
    const path = appPathOf(it.kind, it.ownerId);
    const questions = app.questionsByTopic.get(it.topicId) ?? [];
    const stimuli = app.stimuliByTopic.get(it.topicId) ?? [];
    const appSide = { stimuli, questions };
    const ids = collectImageIds(stimuli, questions);

    // pictures the app uses and where their file comes from
    let toWrite = 0;
    for (const imgId of ids) {
      const rec = app.imageById.get(imgId);
      const here = node ? new Set(node.mediaFiles.map((f) => imageIdFromFileName(f))) : new Set<string | null>();
      if (!rec) continue; // no record: nothing to write, the file (if any) is left as it is
      if (here.has(imgId)) continue;
      if (rec.hasBlob) {
        toWrite++;
        continue;
      }
      const holder = rec.topicId ? nodeOfTopicId.get(rec.topicId) : undefined;
      const holderHas = holder?.mediaFiles.some((f) => imageIdFromFileName(f) === imgId);
      if (holderHas) toWrite++; // copied from the type that holds the file
      else
        res.warnings.push(`${path.join(' › ')}: ছবি ${imgId.slice(0, 8)}… কোথাও পাওয়া যায়নি - লেখা যাবে না`);
    }

    if (!node || !node.hasData) {
      res.entries.push({
        scope,
        kind: it.kind,
        action: 'create',
        path,
        note: node ? 'data.json লেখা হবে' : 'ফোল্ডারসহ data.json লেখা হবে',
        topic: toTopicDiff({ ...emptySetDiff(), questionsAdded: questions.map((q) => ({ id: q.id, type: q.type, title: titleOf(q) })), stimuliAdded: stimuli.length }, { imagesNew: 0, imagesMissing: [] }, toWrite),
      });
      continue;
    }

    const read = fileData.get(node.path);
    if (!read || !read.payload) {
      // damaged data.json: it is simply rewritten from the app (the app always has the full data)
      res.entries.push({ scope, kind: it.kind, action: 'update', path, note: 'data.json আবার লেখা হবে', topic: toTopicDiff(emptySetDiff(), { imagesNew: 0, imagesMissing: [] }, toWrite) });
      continue;
    }

    const fileSide = normalizePayload(read.payload, it.topicId);
    const diff = diffContent(appSide, fileSide);
    const td = toTopicDiff(diff, { imagesNew: 0, imagesMissing: [] }, toWrite);
    if (topicHasChange(td)) {
      res.entries.push({
        scope,
        kind: it.kind,
        action: 'update',
        path,
        topic: td,
        destructive: diff.questionsRemoved.length > 0 || diff.questionsChanged.length > 0,
      });
    }
    // picture files in media/ that nothing in the app refers to -> unnecessary/media/
    // (only pictures this type's questions / stimuli really use count - a leftover picture that is merely still in the
    //  app's image table, e.g. after a replaced picture or a deleted question, is unnecessary too)
    const known = new Set<string>(ids);
    res.extras.push(...extraImageEntries(scope, node, known));
  }

  // files / folders inside the folders the app knows, that the app does not need
  for (const n of matched) if (!dupNodes.has(n)) res.extras.push(...extrasOfNode(scope, n));

  // ---- folders the app does not have ----
  for (const n of dupNodes) {
    res.extras.push(copiedFolderEntry(scope, n, `কপি করা ফোল্ডার: ${nodeLabel(n)} (একই id-র মূল ফোল্ডার আছে)`));
  }
  const isUnmatched = (n: FolderNode): boolean => !matched.has(n) && !dupNodes.has(n);
  const handled = new Set<FolderNode>();
  for (const n of nodes) {
    if (!isUnmatched(n)) continue;
    // only the top-most unknown folder - its children go with it
    let top = true;
    for (let p = n.parent; p; p = p.parent) if (isUnmatched(p) || dupNodes.has(p)) top = false;
    if (!top || handled.has(n)) continue;
    handled.add(n);
    res.extras.push(extraFolderEntry(scope, n));
  }

  return res;
}

/* ------------------------------------------------------------------
 * Totals (for the title of the preview window)
 * ---------------------------------------------------------------- */

export interface PreviewTotals {
  add: number;
  create: number;
  rename: number;
  move: number;
  delete: number;
  update: number;
  questionsAdded: number;
  questionsRemoved: number;
  questionsChanged: number;
  imagesToWrite: number;
  /** conflicts are counted on their own, never mixed into the numbers above */
  conflicts: number;
  /** extra (unnecessary) items - also counted on their own */
  extras: number;
}

export function summarize(entries: PreviewEntry[], conflicts: ConflictEntry[], extras: ExtraEntry[] = []): PreviewTotals {
  const t: PreviewTotals = {
    add: 0,
    create: 0,
    rename: 0,
    move: 0,
    delete: 0,
    update: 0,
    questionsAdded: 0,
    questionsRemoved: 0,
    questionsChanged: 0,
    imagesToWrite: 0,
    conflicts: conflicts.length,
    extras: extras.length,
  };
  for (const e of entries) {
    if (e.action !== 'info') t[e.action]++;
    if (e.topic && e.action !== 'info') {
      t.questionsAdded += e.topic.questionsAdded.length;
      t.questionsRemoved += e.topic.questionsRemoved.length;
      t.questionsChanged += e.topic.questionsChanged.length;
      t.imagesToWrite += e.topic.imagesToWrite;
    }
  }
  return t;
}

export function hasAnyChange(t: PreviewTotals): boolean {
  return t.add + t.create + t.rename + t.move + t.delete + t.update + t.conflicts + (t.extras ?? 0) > 0;
}
