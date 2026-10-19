import { FolderNode, Question } from '../types';

const t = (id: string, parentId: string, title: string): FolderNode => ({ id, parentId, level: 'topic', title, children: [] });

export const folders: FolderNode[] = [{
  id: 'phy', parentId: null, level: 'subject', title: '01. Physics', children: [
    { id: 'p1', parentId: 'phy', level: 'paper', title: '1. Physics 1st', children: [
      { id: 'c5', parentId: 'p1', level: 'chapter', title: '05. কাজ, শক্তি ও ক্ষমতা', children: [t('c5t6', 'c5', '6. কুয়া ও চৌবাচ্চা')] },
      { id: 'c6', parentId: 'p1', level: 'chapter', title: '06. মহাকর্ষ ও অভিকর্ষ', children: [
        t('c6t1', 'c6', '1. মহাকর্ষীয় বলের সূত্রের ব্যবহার'), t('c6t2', 'c6', '2. অভিকর্ষজ ত্বরণ')] },
    ] },
    { id: 'p2', parentId: 'phy', level: 'paper', title: '2. Physics 2nd', children: [
      { id: 'c3', parentId: 'p2', level: 'chapter', title: '03. চল তড়িৎ', children: [
        t('c3t1', 'c3', '1. রোধ ও রোধের সমবায়'), t('c3t2', 'c3', '2. বর্তনীতে ওহমের সূত্রের প্রয়োগ')] },
    ] },
  ],
}];

export const sampleQuestions: Question[] = [{
  id: 'q1', folderId: 'c6t2', createdAt: Date.now(), difficulty: 3,
  usage: [{ examName: 'Model Test 4', date: '2026-03-12' }],
  stimulus: { text: 'পৃথিবীর ভর [M = 6 \\times 10^{24}\\, kg] এবং ব্যাসার্ধ [R = 6400\\, km]।', images: [] },
  gha: { label: 'গ', marks: 3, includeInCreate: true, sources: [{ board: 'ঢাকা বোর্ড', year: 2023 }],
    text: 'পৃথিবী পৃষ্ঠে অভিকর্ষজ ত্বরণ [g = \\frac{GM}{R^2}] নির্ণয় কর।' },
  ghe: { label: 'ঘ', marks: 4, includeInCreate: true, sources: [{ board: 'রাজশাহী বোর্ড', year: 2022 }],
    text: 'পৃথিবী পৃষ্ঠ থেকে [h = R] উচ্চতায় [g] এর মান কত হবে? বিশ্লেষণ কর।' },
}];
