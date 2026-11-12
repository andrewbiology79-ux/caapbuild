import { describe, it, expect } from 'vitest';
import type { Chapter, CopyImage, Question, QuestionCopy, Stimulus, Subject, Topic } from '../src/db/db';
import {
  CHAPTER_DEFAULT_TOPIC_NAME,
  bankMissingBadgeText,
  bankMissingCountsByPaper,
  bankMissingIdsOfPaper,
  copiesToPrevious,
  copyImageIdsOf,
  copyRecordFromCopied,
  deleteConfirmNote,
  fillMissingQuestions,
  fillMissingStimuli,
  findByName,
  makeCopyRecord,
  mergePreviousCopies,
  orphanedCopyImageIds,
  planPrune,
  questionsNeedingCopy,
  restoreCopyToBank,
  restoreResultMessage,
  selectCopiesForIds,
  usedQuestionIds,
  type BankPort,
  paperCountUsingQuestions,
  deleteConfirmNoteMany,
  withDeleteNote,
  restoreSummaryMessage,
  restoreConfirmText,
  missingIdsInGroup,
} from '../src/storage/bankMissing';
import { emptyPreviousCopies, bankPathOf } from '../src/storage/categoryCopies';

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  topicId: 't1',
  type: 'গ',
  marks: 3,
  questionText: `প্রশ্ন ${id}`,
  solutionText: '',
  solutionImageIds: [],
  rating: 3,
  order: 1,
  usedInBoards: [],
  ...over,
});
const stim = (id: string, over: Partial<Stimulus> = {}): Stimulus => ({ id, topicId: 't1', text: `উদ্দীপক ${id}`, imageIds: [], ...over });
const typePath = bankPathOf('type', 'পদার্থ', 'গতি', 'বেগ');
const chapterPath = bankPathOf('chapter', 'পদার্থ', 'গতি', '');

const record = (question: Question, stimulus?: Stimulus, path = typePath): QuestionCopy => {
  const r = makeCopyRecord({ question, stimulus, path }, 100);
  if (!r.ok) throw new Error(r.reason);
  return r.record;
};

/* ------------------------------------------------------------------
 * নকল BankPort (মেমরিতে; run() ব্যর্থ হলে আগের অবস্থায় ফেরে - Dexie transaction-এর মতো)
 * ---------------------------------------------------------------- */

interface FakeState {
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  images: Array<{ id: string; fileName: string; blob?: Blob; topicId?: string }>;
}

function fakePort(init: Partial<FakeState> = {}, failOn?: 'putQuestion') {
  const st: FakeState = { subjects: [], chapters: [], topics: [], stimuli: [], questions: [], images: [], ...init };
  const log: string[] = [];
  let inRun = false;
  const guard = (name: string) => {
    if (!inRun && /^(add|put)/.test(name)) log.push(`OUTSIDE-RUN:${name}`);
    log.push(name);
  };
  const port: BankPort = {
    listSubjects: async () => [...st.subjects],
    listChapters: async (sid) => st.chapters.filter((c) => c.subjectId === sid),
    listTopics: async (cid) => st.topics.filter((t) => t.chapterId === cid),
    hasQuestion: async (id) => st.questions.some((x) => x.id === id),
    getStimulus: async (id) => st.stimuli.find((s) => s.id === id),
    hasImage: async (id) => st.images.some((i) => i.id === id),
    maxQuestionOrder: async (tid) => st.questions.filter((x) => x.topicId === tid).reduce((m, x) => Math.max(m, x.order || 0), 0),
    addSubject: async (s) => {
      guard('addSubject');
      st.subjects.push(s);
    },
    addChapter: async (c) => {
      guard('addChapter');
      st.chapters.push(c);
    },
    addTopic: async (t) => {
      guard('addTopic');
      st.topics.push(t);
    },
    putStimulus: async (s) => {
      guard('putStimulus');
      st.stimuli.push(s);
    },
    putQuestion: async (x) => {
      guard('putQuestion');
      if (failOn === 'putQuestion') throw new Error('boom');
      st.questions.push(x);
    },
    putImage: async (img) => {
      guard('putImage');
      st.images.push({ id: img.id, fileName: img.fileName, blob: img.blob });
    },
    run: async (fn) => {
      const snap = JSON.stringify({ ...st, images: st.images.map((i) => ({ ...i, blob: undefined })) });
      const imgBlobs = st.images.map((i) => i.blob);
      inRun = true;
      try {
        return await fn();
      } catch (e) {
        const back = JSON.parse(snap) as FakeState;
        st.subjects = back.subjects;
        st.chapters = back.chapters;
        st.topics = back.topics;
        st.stimuli = back.stimuli;
        st.questions = back.questions;
        st.images = back.images.map((i, ix) => ({ ...i, blob: imgBlobs[ix] }));
        throw e;
      } finally {
        inRun = false;
      }
    },
  };
  return { port, st, log };
}

const blob = (tag: string) => ({ tag } as unknown as Blob);
const imgSource = (have: string[]) => async (id: string): Promise<CopyImage | null> => (have.includes(id) ? { id, fileName: `${id}.webp`, blob: blob(id) } : null);

/* ------------------------------------------------------------------ */

describe('copyImageIdsOf', () => {
  it('উদ্দীপকের ছবি আগে, তারপর সমাধানের ছবি; একই id একবার', () => {
    expect(copyImageIdsOf(q('a', { solutionImageIds: ['s1', 'x'] }), stim('s', { imageIds: ['x', 'u1'] }))).toEqual(['x', 'u1', 's1']);
  });
  it('উদ্দীপক না থাকলে শুধু সমাধানের ছবি; ভুল ঘর উপেক্ষা', () => {
    expect(copyImageIdsOf(q('a', { solutionImageIds: ['s1', '', 5 as any] }), null)).toEqual(['s1']);
  });
});

describe('makeCopyRecord', () => {
  it('ঠিক ডেটা থেকে রেকর্ড: id, পথ, ছবির id, savedAt', () => {
    const r = makeCopyRecord({ question: q('q1', { stimulusId: 's1', solutionImageIds: ['i2'] }), stimulus: stim('s1', { imageIds: ['i1'] }), path: typePath }, 555);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.id).toBe('q1');
    expect(r.record.path).toEqual(typePath);
    expect(r.record.imageIds).toEqual(['i1', 'i2']);
    expect(r.record.savedAt).toBe(555);
    expect(r.record.stimulus?.id).toBe('s1');
  });

  it('অনুপস্থিত ঘরে কপিতে ডিফল্ট বসে, মূল প্রশ্ন বদলায় না', () => {
    const raw: any = q('q1');
    delete raw.solutionText;
    delete raw.rating;
    const r = makeCopyRecord({ question: raw, path: typePath }, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.question.solutionText).toBe('');
    expect(r.record.question.rating).toBe(0);
    expect(r.filled.length).toBe(2);
    expect('solutionText' in raw).toBe(false);
  });

  it('topicId বা type না থাকলে বানানো যায় না (অনুমান নয়)', () => {
    const noTopic: any = q('q1');
    delete noTopic.topicId;
    const a = makeCopyRecord({ question: noTopic, path: typePath }, 1);
    expect(a.ok).toBe(false);
    const badType = makeCopyRecord({ question: q('q2', { type: 'ঙ' as any }), path: typePath }, 1);
    expect(badType.ok).toBe(false);
  });

  it('পথ ভুল হলে (Type CQ-তে topic খালি) বানানো যায় না; Chapter CQ-তে topic খালি চলে', () => {
    expect(makeCopyRecord({ question: q('q1'), path: { scope: 'type', subject: 'পদার্থ', chapter: 'গতি', topic: '' } }, 1).ok).toBe(false);
    expect(makeCopyRecord({ question: q('q1'), path: chapterPath }, 1).ok).toBe(true);
  });
});

describe('copyRecordFromCopied (data.json-এর কপি থেকে)', () => {
  it('প্রশ্নের stimulusId-র সাথে মিললে তবেই উদ্দীপক নেয়', () => {
    const cq = { question: q('q1', { stimulusId: 's1' }), path: typePath };
    const ok = copyRecordFromCopied(cq, { stimulus: stim('s1'), path: typePath }, 1);
    expect(ok.ok && ok.record.stimulus?.id).toBe('s1');
    const other = copyRecordFromCopied(cq, { stimulus: stim('sX'), path: typePath }, 1);
    expect(other.ok && other.record.stimulus).toBeUndefined();
  });
});

describe('copiesToPrevious / mergePreviousCopies', () => {
  it('রেকর্ড -> আগের কপি; উদ্দীপক একবার', () => {
    const a = record(q('q1', { stimulusId: 's1' }), stim('s1'));
    const b = record(q('q2', { stimulusId: 's1' }), stim('s1'));
    const prev = copiesToPrevious([a, b]);
    expect(prev.questions.size).toBe(2);
    expect(prev.stimuli.size).toBe(1);
    expect(prev.questions.get('q1')?.path).toEqual(typePath);
  });

  it('merge: primary জেতে, secondary থেকে বাকিটা আসে', () => {
    const primary = emptyPreviousCopies();
    primary.questions.set('q1', { question: q('q1', { questionText: 'ফাইল' }), path: typePath });
    const second = copiesToPrevious([record(q('q1', { questionText: 'ডেটাবেস' })), record(q('q2'))]);
    const m = mergePreviousCopies(primary, second);
    expect(m.questions.get('q1')?.question.questionText).toBe('ফাইল');
    expect(m.questions.has('q2')).toBe(true);
  });
});

describe('questionsNeedingCopy / usedQuestionIds', () => {
  const papers = [{ questionIds: ['a', 'b'] }, { questionIds: ['b', 'c'] }, { questionIds: undefined as any }];
  it('শুধু প্রশ্নপত্রে ব্যবহৃত প্রশ্ন; একবার করে', () => {
    expect(questionsNeedingCopy(['a', 'x', 'b', 'b'], papers, new Set())).toEqual(['a', 'b']);
  });
  it('আগে কপি থাকলেও মোছার মুহূর্তের রূপে আবার (refresh); refresh বন্ধ করলে বাদ', () => {
    expect(questionsNeedingCopy(['a'], papers, new Set(['a']))).toEqual(['a']);
    expect(questionsNeedingCopy(['a'], papers, new Set(['a']), false)).toEqual([]);
  });
  it('usedQuestionIds ভাঙা তালিকা সামলায়', () => {
    expect(Array.from(usedQuestionIds(papers)).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('planPrune / orphanedCopyImageIds', () => {
  const a = record(q('a', { solutionImageIds: ['i1', 'shared'] }));
  const b = record(q('b', { solutionImageIds: ['shared', 'i2'] }));
  const c = record(q('c', { solutionImageIds: ['i3'] }));

  it('ব্যাংকে ফিরেছে বা কেউ ব্যবহার করে না - মুছবে; বাকিদের ছবি রাখবে', () => {
    const plan = planPrune([a, b, c], new Set(['a']), new Set(['b', 'a']));
    expect(plan.inBank).toEqual(['a']);
    expect(plan.unused).toEqual(['c']);
    expect(plan.removeIds.sort()).toEqual(['a', 'c']);
    // 'shared' b-র দরকার, তাই থাকে; i1, i3 যায়
    expect(plan.removeImageIds.sort()).toEqual(['i1', 'i3']);
  });
  it('কিছু মোছার না থাকলে খালি', () => {
    const plan = planPrune([a], new Set(), new Set(['a']));
    expect(plan.removeIds).toEqual([]);
    expect(plan.removeImageIds).toEqual([]);
  });
  it('orphanedCopyImageIds', () => {
    expect(orphanedCopyImageIds([a], [b]).sort()).toEqual(['i1']);
    expect(orphanedCopyImageIds([a], []).sort()).toEqual(['i1', 'shared']);
  });
});

describe('fillMissing*', () => {
  it('প্রশ্ন: ব্যাংকে পাওয়াগুলো অক্ষত, বাকিগুলো কপি থেকে', () => {
    const copies = new Map([['b', record(q('b', { questionText: 'কপি-খ' }))]]);
    const out = fillMissingQuestions(['a', 'b', 'zz'], [q('a')], copies);
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
    expect(out[1].questionText).toBe('কপি-খ');
  });
  it('প্রশ্ন: ব্যাংকে থাকলে কপি আর ব্যবহার হয় না', () => {
    const copies = new Map([['a', record(q('a', { questionText: 'পুরনো কপি' }))]]);
    const out = fillMissingQuestions(['a'], [q('a', { questionText: 'ব্যাংক' })], copies);
    expect(out).toHaveLength(1);
    expect(out[0].questionText).toBe('ব্যাংক');
  });
  it('উদ্দীপক: কপি থেকে, একবার; ব্যাংকে থাকলে সেটাই', () => {
    const copies = [record(q('b', { stimulusId: 's1' }), stim('s1', { text: 'কপি' })), record(q('c', { stimulusId: 's1' }), stim('s1', { text: 'কপি' }))];
    const out = fillMissingStimuli(['s1', 's2'], [stim('s2')], copies);
    expect(out.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    const bank = fillMissingStimuli(['s1'], [stim('s1', { text: 'ব্যাংক' })], copies);
    expect(bank).toHaveLength(1);
    expect(bank[0].text).toBe('ব্যাংক');
  });
});

describe('bankMissingIdsOfPaper / counts', () => {
  const paper = { id: 'p1', questionIds: ['a', 'b', 'c', 'b'] };
  it('কপি আছে ও ব্যাংকে নেই - প্রশ্নপত্রের ক্রমে, একবার', () => {
    expect(bankMissingIdsOfPaper(paper, new Set(['a']), new Set(['a', 'b', 'c']))).toEqual(['b', 'c']);
  });
  it('কপি না থাকলে (হারানো প্রশ্ন) গোনা হয় না - সেটা বিদ্যমান lostWarning-র কাজ', () => {
    expect(bankMissingIdsOfPaper(paper, new Set(), new Set(['c']))).toEqual(['c']);
  });
  it('counts: শুধু > 0', () => {
    const m = bankMissingCountsByPaper([paper, { id: 'p2', questionIds: ['a'] }], new Set(['a']), new Set(['a', 'b', 'c']));
    expect(m.get('p1')).toBe(2);
    expect(m.has('p2')).toBe(false);
  });
});

describe('restoreCopyToBank', () => {
  it('পথ নেই: বিষয়/অধ্যায়/টপিক বানায়, একই id-তে প্রশ্ন, ক্রম = ১', async () => {
    const f = fakePort();
    const r = await restoreCopyToBank(record(q('q1')), f.port, imgSource([]));
    expect(r.status).toBe('restored');
    expect(r.created).toEqual({ subject: true, chapter: true, topic: true, stimulus: false });
    expect(f.st.subjects.map((s) => s.name)).toEqual(['পদার্থ']);
    expect(f.st.chapters.map((c) => c.name)).toEqual(['গতি']);
    expect(f.st.topics.map((t) => t.name)).toEqual(['বেগ']);
    expect(f.st.questions).toHaveLength(1);
    expect(f.st.questions[0].id).toBe('q1');
    expect(f.st.questions[0].topicId).toBe(f.st.topics[0].id);
    expect(f.st.questions[0].order).toBe(1);
    expect(f.log.filter((l) => l.startsWith('OUTSIDE-RUN'))).toEqual([]);
  });

  it('একই নামের পথ থাকলে সেটাই ব্যবহার (ফাঁকা/বড়-ছোট হাত অগ্রাহ্য), নতুন কিছু বানায় না; ক্রম টপিকের শেষে', async () => {
    const f = fakePort({
      subjects: [{ id: 'S', name: ' পদার্থ ', order: 1 }],
      chapters: [{ id: 'C', subjectId: 'S', name: 'গতি', order: 1 }],
      topics: [{ id: 'T', chapterId: 'C', name: 'বেগ', order: 1 }],
      questions: [q('old', { topicId: 'T', order: 7 })],
    });
    const r = await restoreCopyToBank(record(q('q1')), f.port, imgSource([]));
    expect(r.status).toBe('restored');
    expect(r.created).toEqual({ subject: false, chapter: false, topic: false, stimulus: false });
    expect(f.st.subjects).toHaveLength(1);
    expect(f.st.topics).toHaveLength(1);
    const back = f.st.questions.find((x) => x.id === 'q1')!;
    expect(back.topicId).toBe('T');
    expect(back.order).toBe(8);
  });

  it('অধ্যায় আছে কিন্তু টপিক নেই: শুধু টপিক বানায়', async () => {
    const f = fakePort({ subjects: [{ id: 'S', name: 'পদার্থ', order: 1 }], chapters: [{ id: 'C', subjectId: 'S', name: 'গতি', order: 1 }], topics: [{ id: 'T0', chapterId: 'C', name: 'অন্য', order: 1 }] });
    const r = await restoreCopyToBank(record(q('q1')), f.port, imgSource([]));
    expect(r.created).toEqual({ subject: false, chapter: false, topic: true, stimulus: false });
    expect(f.st.topics.map((t) => t.name).sort()).toEqual(['অন্য', 'বেগ']);
    expect(f.st.topics.find((t) => t.name === 'বেগ')!.order).toBe(2);
  });

  it('Chapter CQ: অধ্যায়ের প্রথম টপিকে যায়; না থাকলে "সকল প্রশ্ন" বানায়', async () => {
    const withTopic = fakePort({
      subjects: [{ id: 'S', name: 'পদার্থ', order: 1 }],
      chapters: [{ id: 'C', subjectId: 'S', name: 'গতি', order: 1 }],
      topics: [
        { id: 'B', chapterId: 'C', name: 'দ্বিতীয়', order: 2 },
        { id: 'A', chapterId: 'C', name: 'প্রথম', order: 1 },
      ],
    });
    await restoreCopyToBank(record(q('q1'), undefined, chapterPath), withTopic.port, imgSource([]));
    expect(withTopic.st.questions[0].topicId).toBe('A');

    const empty = fakePort();
    const r = await restoreCopyToBank(record(q('q2'), undefined, chapterPath), empty.port, imgSource([]));
    expect(r.created.topic).toBe(true);
    expect(empty.st.topics[0].name).toBe(CHAPTER_DEFAULT_TOPIC_NAME);
  });

  it('একই উদ্দীপকের গ ও ঘ আলাদা করে যোগ করলেও উদ্দীপক একবারই তৈরি হয়', async () => {
    const f = fakePort();
    const s = stim('s1', { imageIds: ['u1'] });
    const g = record(q('qg', { stimulusId: 's1' }), s);
    const gh = record(q('qh', { type: 'ঘ', stimulusId: 's1' }), s);
    const r1 = await restoreCopyToBank(g, f.port, imgSource(['u1']));
    const r2 = await restoreCopyToBank(gh, f.port, imgSource(['u1']));
    expect(r1.created.stimulus).toBe(true);
    expect(r2.created.stimulus).toBe(false);
    expect(f.st.stimuli).toHaveLength(1);
    expect(f.st.stimuli[0].topicId).toBe(f.st.topics[0].id);
    expect(f.st.questions.map((x) => x.stimulusId)).toEqual(['s1', 's1']);
    expect(f.st.images).toHaveLength(1); // ছবিও একবার
    expect(f.st.topics).toHaveLength(1);
  });

  it('ছবি: ব্যাংকে আগে থেকে থাকলে বসায় না; না থাকলে blob সহ বসায় (topicId ছাড়া); উৎস না পেলে জানায় কিন্তু প্রশ্ন ফেরে', async () => {
    const f = fakePort({ images: [{ id: 'have', fileName: 'have.webp' }] });
    const r = await restoreCopyToBank(record(q('q1', { solutionImageIds: ['have', 'new', 'gone'] })), f.port, imgSource(['new']));
    expect(r.status).toBe('restored');
    expect(r.missingImages).toEqual(['gone']);
    expect(r.warnings.length).toBe(1);
    expect(f.st.images.map((i) => i.id).sort()).toEqual(['have', 'new']);
    const added = f.st.images.find((i) => i.id === 'new')!;
    expect(added.topicId).toBeUndefined();
    expect(added.blob).toBeDefined();
    expect(f.st.questions).toHaveLength(1);
  });

  it('একই id-র প্রশ্ন ব্যাংকে আছে: already, কিছুই বদলায় না', async () => {
    const f = fakePort({ questions: [q('q1', { topicId: 'T' })] });
    const r = await restoreCopyToBank(record(q('q1')), f.port, imgSource([]));
    expect(r.status).toBe('already');
    expect(f.st.subjects).toEqual([]);
    expect(f.log).toEqual([]);
  });

  it('কপি ভুল হলে failed, কিছু লেখে না', async () => {
    const f = fakePort();
    const bad = { ...record(q('q1')), path: { scope: 'type', subject: '', chapter: 'গতি', topic: 'বেগ' } as any };
    const r = await restoreCopyToBank(bad, f.port, imgSource([]));
    expect(r.status).toBe('failed');
    expect(r.reason).toBeDefined();
    expect(f.log).toEqual([]);
  });

  it('মাঝপথে লেখা ভাঙলে (transaction) কিছুই থাকে না', async () => {
    const f = fakePort({}, 'putQuestion');
    let threw = false;
    try {
      await restoreCopyToBank(record(q('q1', { stimulusId: 's1' }), stim('s1')), f.port, imgSource([]));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(f.st.subjects).toHaveLength(0);
    expect(f.st.stimuli).toHaveLength(0);
    expect(f.st.questions).toHaveLength(0);
  });

  it('কপিতে উদ্দীপক না থাকলে ঝুলন্ত stimulusId থাকে না, সতর্কতা আসে', async () => {
    const f = fakePort();
    const rec = record(q('q1', { stimulusId: 's9' }), undefined);
    const r = await restoreCopyToBank(rec, f.port, imgSource([]));
    expect(r.status).toBe('restored');
    expect(f.st.questions[0].stimulusId).toBeUndefined();
    expect(r.warnings.length).toBe(1);
  });
});

describe('findByName', () => {
  it('একই নামের প্রথমটা (ক্রম অনুযায়ী)', () => {
    const list = [
      { id: 'b', name: 'গতি', order: 2 },
      { id: 'a', name: ' গতি ', order: 1 },
    ];
    expect(findByName(list, 'গতি')?.id).toBe('a');
    expect(findByName(list, 'নেই')).toBeUndefined();
  });
});

describe('বার্তা', () => {
  it('মোছার নিশ্চিতকরণ লাইন', () => {
    expect(deleteConfirmNote(0)).toBeNull();
    expect(deleteConfirmNote(3)).toBe('প্রশ্নটা ৩টি প্রশ্নপত্রে আছে। ব্যাংক থেকে মুছলেও সেখানে থেকে যাবে।');
  });
  it('কার্ডের চিহ্ন', () => {
    expect(bankMissingBadgeText(0)).toBeNull();
    expect(bankMissingBadgeText(12)).toBe('কিছু প্রশ্ন ব্যাংকে নেই (১২)');
  });
  it('ফেরানোর ফল বার্তা', () => {
    expect(restoreResultMessage({ status: 'already', questionId: 'a', created: { subject: false, chapter: false, topic: false, stimulus: false }, missingImages: [], warnings: [] })).toBe('প্রশ্নটা ব্যাংকে আগে থেকেই আছে');
    expect(restoreResultMessage({ status: 'failed', questionId: 'a', reason: 'কপি ঠিক নেই', created: { subject: false, chapter: false, topic: false, stimulus: false }, missingImages: [], warnings: [] })).toBe('ব্যাংকে ফেরানো যায়নি: কপি ঠিক নেই');
    const ok = restoreResultMessage({ status: 'restored', questionId: 'a', created: { subject: false, chapter: true, topic: true, stimulus: false }, missingImages: [], warnings: [] });
    expect(ok).toBe('প্রশ্নটা ব্যাংকে ফিরেছে (নতুন অধ্যায়, টপিক তৈরি হয়েছে)');
  });
});

describe('selectCopiesForIds (ক্যাটেগরির data.json থেকে কপি বাছা)', () => {
  const cq = (id: string, over: Partial<Question> = {}) => ({ question: q(id, over), path: typePath });
  const cs = (id: string) => ({ stimulus: stim(id), path: typePath });

  it('চাওয়া id-র প্রশ্ন ও সংশ্লিষ্ট উদ্দীপক বাছে; ফাইলে না থাকলে notFound', () => {
    const r = selectCopiesForIds(['a', 'b', 'zzz'], [cq('a', { stimulusId: 's1' }), cq('b'), cq('c')], [cs('s1'), cs('s2')]);
    expect(r.items.map((i) => i.question.question.id)).toEqual(['a', 'b']);
    expect(r.items[0].stimulus?.stimulus.id).toBe('s1');
    expect(r.items[1].stimulus).toBeUndefined();
    expect(r.notFound).toEqual(['zzz']);
  });

  it('উদ্দীপক ফাইলে না থাকলে প্রশ্ন তবু বাছা হয় (উদ্দীপক ছাড়া)', () => {
    const r = selectCopiesForIds(['a'], [cq('a', { stimulusId: 'missing' })], []);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].stimulus).toBeUndefined();
    expect(r.notFound).toEqual([]);
  });

  it('একই id দুবার চাইলে একবারই; একই id-র দুই কপি থাকলে প্রথমটা', () => {
    const r = selectCopiesForIds(['a', 'a'], [cq('a', { questionText: 'প্রথম' }), cq('a', { questionText: 'দ্বিতীয়' })], []);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].question.question.questionText).toBe('প্রথম');
  });

  it('বাছাই করা জোড়া copyRecordFromCopied-এ বৈধ রেকর্ড হয়', () => {
    const r = selectCopiesForIds(['a'], [cq('a', { stimulusId: 's1' })], [cs('s1')]);
    const made = copyRecordFromCopied(r.items[0].question, r.items[0].stimulus, 5);
    expect(made.ok).toBe(true);
    if (made.ok) expect(made.record.stimulus?.id).toBe('s1');
  });

  it('খালি ইনপুটে খালি ফল', () => {
    const r = selectCopiesForIds([], [], []);
    expect(r.items).toEqual([]);
    expect(r.notFound).toEqual([]);
  });
});


describe('মোছার নিশ্চিতকরণের নোট (১ঘ-খ-২ক)', () => {
  const papers = [
    { id: 'p1', questionIds: ['a', 'b'] },
    { id: 'p2', questionIds: ['b', 'c'] },
    { id: 'p3', questionIds: ['x'] },
  ] as any[];

  it('paperCountUsingQuestions: আলাদা প্রশ্নপত্র গোনে, একই প্রশ্নপত্র দুবার নয়', () => {
    expect(paperCountUsingQuestions(papers, ['a'])).toBe(1);
    expect(paperCountUsingQuestions(papers, ['b'])).toBe(2);
    expect(paperCountUsingQuestions(papers, ['a', 'b'])).toBe(2);
    expect(paperCountUsingQuestions(papers, ['a', 'b', 'c', 'x'])).toBe(3);
  });

  it('paperCountUsingQuestions: খালি/অজানা id ও ভাঙা প্রশ্নপত্রে 0', () => {
    expect(paperCountUsingQuestions(papers, [])).toBe(0);
    expect(paperCountUsingQuestions(papers, ['', 'zzz'])).toBe(0);
    expect(paperCountUsingQuestions([{ id: 'q' }, { id: 'r', questionIds: 'oops' }] as any[], ['a'])).toBe(0);
  });

  it('deleteConfirmNoteMany: কোনো প্রশ্নপত্রে না থাকলে null', () => {
    expect(deleteConfirmNoteMany(0, 3)).toBeNull();
  });

  it('deleteConfirmNoteMany: একটা প্রশ্ন হলে deleteConfirmNote-এর লেখা, একাধিক হলে "এর কিছু প্রশ্ন"', () => {
    expect(deleteConfirmNoteMany(2, 1)).toBe(deleteConfirmNote(2));
    const many = deleteConfirmNoteMany(2, 4);
    expect(many).toContain('এর কিছু প্রশ্ন');
    expect(many).toContain('থেকে যাবে');
  });

  it('withDeleteNote: নোট থাকলে নিচে জোড়ে, না থাকলে বার্তা অপরিবর্তিত', () => {
    expect(withDeleteNote('বার্তা', null)).toBe('বার্তা');
    expect(withDeleteNote('বার্তা', 'নোট')).toBe('বার্তা\n\nনোট');
  });
});


describe('সম্পাদনা উইন্ডোর ফেরানো - বার্তা ও বাছাই (১ঘ-খ-২খ)', () => {
  const ok = (id: string, created = false): any => ({ status: 'restored', questionId: id, created: { subject: created, chapter: false, topic: false, stimulus: false }, missingImages: [], warnings: [] });
  const bad = (id: string, reason: string): any => ({ status: 'failed', questionId: id, reason, created: { subject: false, chapter: false, topic: false, stimulus: false }, missingImages: [], warnings: [] });

  it('missingIdsInGroup: কার্ডের ক্রমে শুধু ব্যাংকে-নেই প্রশ্ন', () => {
    expect(missingIdsInGroup(['a', 'b', 'c'], new Set(['c', 'a']))).toEqual(['a', 'c']);
    expect(missingIdsInGroup(['a'], new Set())).toEqual([]);
  });

  it('restoreConfirmText: একটা প্রশ্নে একবচন, একাধিকে সংখ্যাসহ', () => {
    expect(restoreConfirmText(1).message).toContain('প্রশ্নটা প্রশ্ন ব্যাংকে যোগ করবেন?');
    expect(restoreConfirmText(2).message).toContain('২টি প্রশ্ন');
  });

  it('restoreSummaryMessage: একটাই ফল হলে আগের restoreResultMessage-এর লেখা', () => {
    expect(restoreSummaryMessage([ok('a')])).toBe(restoreResultMessage(ok('a')));
    expect(restoreSummaryMessage([])).toContain('ফেরানোর মতো প্রশ্ন নেই');
  });

  it('restoreSummaryMessage: সব সফল / সব ব্যর্থ / আংশিক', () => {
    expect(restoreSummaryMessage([ok('a'), ok('b')])).toBe('২টি প্রশ্ন ব্যাংকে ফিরেছে');
    expect(restoreSummaryMessage([bad('a', 'কপি নেই'), bad('b', 'অন্য')])).toBe('ব্যাংকে ফেরানো যায়নি: কপি নেই');
    const mixed = restoreSummaryMessage([ok('a'), bad('b', 'কপি নেই')]);
    expect(mixed).toContain('১টি প্রশ্ন ব্যাংকে ফিরেছে');
    expect(mixed).toContain('১টি ফেরানো যায়নি');
  });

  it('restoreSummaryMessage: already-ও সফল গণ্য', () => {
    const already: any = { status: 'already', questionId: 'b', created: { subject: false, chapter: false, topic: false, stimulus: false }, missingImages: [], warnings: [] };
    expect(restoreSummaryMessage([ok('a'), already])).toBe('২টি প্রশ্ন ব্যাংকে ফিরেছে');
  });
});
