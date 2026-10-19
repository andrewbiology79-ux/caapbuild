import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { folders as seedFolders, sampleQuestions } from '../data/seed';
import { Answer, ClipboardPayload, FolderLevel, FolderNode, ImageAsset, Question } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
type Which = 'gha' | 'ghe';
export const LEVELS: FolderLevel[] = ['subject', 'paper', 'chapter', 'topic'];

const mapTree = (ns: FolderNode[], fn: (n: FolderNode) => FolderNode | null): FolderNode[] =>
  ns.flatMap((n) => { const r = fn(n); return r ? [{ ...r, children: mapTree(r.children, fn) }] : []; });
const collectIds = (n: FolderNode): string[] => [n.id, ...n.children.flatMap(collectIds)];
const patch = (qs: Question[], id: string, fn: (q: Question) => Question) => qs.map((q) => (q.id === id ? fn(q) : q));

interface State {
  folders: FolderNode[];
  questions: Question[];
  createOrder: string[];
  clipboard: ClipboardPayload;
  // folders
  addFolder: (parentId: string | null, title: string) => void;
  renameFolder: (id: string, title: string) => void;
  deleteFolder: (id: string) => void;
  // questions
  addQuestion: (q: Omit<Question, 'id' | 'createdAt'>) => void;
  updateQuestion: (q: Question) => void;
  deleteQuestion: (id: string) => void;
  addUsage: (ids: string[], examName: string) => void;
  // create-tab selection
  select: (id: string) => void;
  deselect: (id: string) => void;
  reorder: (ids: string[]) => void;
  toggleSub: (id: string, w: Which) => void;
  setAnswer: (id: string, w: Which, a: Answer) => void;
  addStimulusImage: (id: string, img: ImageAsset) => void;
  removeStimulusImage: (id: string, imgId: string) => void;
  // clipboard
  copy: (id: string) => void;
  cut: (id: string) => void;
  paste: (targetId: string, where: 'before' | 'after') => void;
  // backup
  importAll: (data: { folders: FolderNode[]; questions: Question[] }) => void;
  resetAll: () => void;
}

export const useCqStore = create<State>()(persist((set, get) => ({
  folders: seedFolders,
  questions: sampleQuestions,
  createOrder: [],
  clipboard: null,

  addFolder: (parentId, title) => set((s) => {
    if (!parentId) return { folders: [...s.folders, { id: uid(), parentId: null, level: 'subject', title, children: [] }] };
    return { folders: mapTree(s.folders, (n) => n.id !== parentId || n.level === 'topic' ? n : {
      ...n, children: [...n.children, { id: uid(), parentId, level: LEVELS[LEVELS.indexOf(n.level) + 1], title, children: [] }] }) };
  }),
  renameFolder: (id, title) => set((s) => ({ folders: mapTree(s.folders, (n) => (n.id === id ? { ...n, title } : n)) })),
  deleteFolder: (id) => set((s) => {
    let gone: string[] = [];
    const walk = (ns: FolderNode[]) => ns.forEach((n) => { if (n.id === id) gone = collectIds(n); else walk(n.children); });
    walk(s.folders);
    const dead = new Set(s.questions.filter((q) => gone.includes(q.folderId)).map((q) => q.id));
    return { folders: mapTree(s.folders, (n) => (n.id === id ? null : n)),
      questions: s.questions.filter((q) => !dead.has(q.id)), createOrder: s.createOrder.filter((x) => !dead.has(x)) };
  }),

  addQuestion: (q) => set((s) => ({ questions: [...s.questions, { ...q, id: uid(), createdAt: Date.now() }] })),
  updateQuestion: (q) => set((s) => ({ questions: patch(s.questions, q.id, () => q) })),
  deleteQuestion: (id) => set((s) => ({ questions: s.questions.filter((q) => q.id !== id), createOrder: s.createOrder.filter((x) => x !== id) })),
  addUsage: (ids, examName) => set((s) => ({ questions: s.questions.map((q) => ids.includes(q.id)
    ? { ...q, usage: [...q.usage, { examName, date: new Date().toISOString().slice(0, 10) }] } : q) })),

  select: (id) => set((s) => (s.createOrder.includes(id) ? s : { createOrder: [...s.createOrder, id] })),
  deselect: (id) => set((s) => ({ createOrder: s.createOrder.filter((x) => x !== id) })),
  reorder: (ids) => set({ createOrder: ids }),
  toggleSub: (id, w) => set((s) => ({ questions: patch(s.questions, id, (q) => ({ ...q, [w]: { ...q[w], includeInCreate: !q[w].includeInCreate } })) })),
  setAnswer: (id, w, a) => set((s) => ({ questions: patch(s.questions, id, (q) => ({ ...q, [w]: { ...q[w], answer: a } })) })),
  addStimulusImage: (id, img) => set((s) => ({ questions: patch(s.questions, id, (q) => ({ ...q, stimulus: { ...q.stimulus, images: [...q.stimulus.images, img] } })) })),
  removeStimulusImage: (id, imgId) => set((s) => ({ questions: patch(s.questions, id, (q) => ({
    ...q, stimulus: { ...q.stimulus, images: q.stimulus.images.filter((i) => i.id !== imgId) } })) })),

  copy: (id) => set({ clipboard: { mode: 'copy', question: get().questions.find((q) => q.id === id)! } }),
  cut: (id) => set({ clipboard: { mode: 'cut', question: get().questions.find((q) => q.id === id)! } }),
  paste: (targetId, where) => {
    const { clipboard, questions } = get();
    if (!clipboard) return;
    const target = questions.find((q) => q.id === targetId)!;
    const src = clipboard.question;
    const moved: Question = { ...JSON.parse(JSON.stringify(src)), folderId: target.folderId, id: clipboard.mode === 'cut' ? src.id : uid() };
    const list = clipboard.mode === 'cut' ? questions.filter((q) => q.id !== src.id) : [...questions];
    list.splice(list.findIndex((q) => q.id === targetId) + (where === 'after' ? 1 : 0), 0, moved);
    set({ questions: list, clipboard: clipboard.mode === 'cut' ? null : clipboard });
  },

  importAll: (d) => set({ folders: d.folders, questions: d.questions, createOrder: [] }),
  resetAll: () => set({ folders: seedFolders, questions: sampleQuestions, createOrder: [], clipboard: null }),
}), {
  name: 'physics-cq-v1',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ folders: s.folders, questions: s.questions, createOrder: s.createOrder }),
}));
