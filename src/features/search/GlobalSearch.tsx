import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, FileText, Layers, BookOpen } from 'lucide-react';
import { db, getDb, type CqScope, type Paper, type Question } from '../../db/db';
import { openCollectionAtQuestion } from '../../screens/CollectionScreen';
import { openPaperOnProfile } from '../../screens/ProfileScreen';
import { useNavigation } from '../../utils/navigation';

interface QuestionHit {
  kind: 'question';
  scope: CqScope;
  question: Question;
  path: string;
}
interface PaperHit {
  kind: 'paper';
  paper: Paper;
}
type Hit = QuestionHit | PaperHit;

const MAX_PER_GROUP = 30;

const plain = (s: string) =>
  (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const norm = (s: string) => plain(s).toLowerCase();

async function searchScope(scope: CqScope, q: string): Promise<QuestionHit[]> {
  const d = getDb(scope);
  const [qs, topics, chapters, subjects] = await Promise.all([
    d.questions.toArray(),
    d.topics.toArray(),
    d.chapters.toArray(),
    d.subjects.toArray(),
  ]);
  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const chapterMap = new Map(chapters.map((c) => [c.id, c]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const hits: QuestionHit[] = [];
  for (const question of qs) {
    const hay = norm(`${question.questionText} ${question.answerText ?? ''} ${question.solutionText}`);
    if (!hay.includes(q)) continue;
    const topic = topicMap.get(question.topicId);
    const chapter = topic ? chapterMap.get(topic.chapterId) : undefined;
    const subject = chapter ? subjectMap.get(chapter.subjectId) : undefined;
    hits.push({
      kind: 'question',
      scope,
      question,
      path: [subject?.name, chapter?.name, topic?.name].filter(Boolean).join(' › '),
    });
    if (hits.length >= MAX_PER_GROUP) break;
  }
  return hits;
}

/** Floating search button + full-screen overlay that searches questions (Type CQ + Chapter CQ) and papers. */
export const GlobalSearch: React.FC = () => {
  const { switchTab, registerBackHandler } = useNavigation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    return registerBackHandler(() => {
      setOpen(false);
      return true;
    });
  }, [open, registerBackHandler]);

  useEffect(() => {
    const q = norm(query);
    if (!open || q.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    const my = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const [typeHits, chapterHits, papers] = await Promise.all([
          searchScope('type', q),
          searchScope('chapter', q),
          db.papers.toArray(),
        ]);
        const paperHits: PaperHit[] = papers
          .filter((p) => norm(`${p.title} ${p.shortName} ${p.category}`).includes(q))
          .slice(0, MAX_PER_GROUP)
          .map((paper) => ({ kind: 'paper', paper }));
        if (my === seq.current) setHits([...paperHits, ...typeHits, ...chapterHits]);
      } catch (e) {
        console.warn('Global search failed:', e);
        if (my === seq.current) setHits([]);
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  const groups = useMemo(
    () => ({
      papers: hits.filter((h): h is PaperHit => h.kind === 'paper'),
      type: hits.filter((h): h is QuestionHit => h.kind === 'question' && h.scope === 'type'),
      chapter: hits.filter((h): h is QuestionHit => h.kind === 'question' && h.scope === 'chapter'),
    }),
    [hits]
  );

  const close = () => {
    setOpen(false);
    setQuery('');
    setHits([]);
  };

  const openQuestion = async (hit: QuestionHit) => {
    const d = getDb(hit.scope);
    const topic = await d.topics.get(hit.question.topicId);
    const chapter = topic ? await d.chapters.get(topic.chapterId) : undefined;
    const subject = chapter ? await d.subjects.get(chapter.subjectId) : undefined;
    if (topic && chapter && subject) {
      openCollectionAtQuestion(hit.scope, { subject, chapter, topic }, hit.question.id);
    }
    close();
    switchTab(hit.scope === 'chapter' ? 'chapterCq' : 'typeCq');
  };

  const openPaper = (paperId: string) => {
    openPaperOnProfile(paperId);
    close();
    switchTab('profile');
  };

  const total = hits.length;

  return (
    <>
      <button
        type="button"
        aria-label="সব ট্যাবে সার্চ"
        onClick={() => setOpen(true)}
        className="fixed right-4 z-30 w-11 h-11 rounded-full bg-brand text-brand-fg shadow-pop flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Search className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-app text-ink flex flex-col max-w-[390px] mx-auto">
          <div
            className="flex items-center gap-2 px-3 h-14 border-b border-line bg-surface"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', boxSizing: 'content-box' }}
          >
            <Search className="w-5 h-5 text-ink-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="প্রশ্ন বা প্রশ্নপত্র খুঁজুন…"
              className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-muted"
            />
            <button
              type="button"
              aria-label="সার্চ বন্ধ করুন"
              onClick={close}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-ink-muted hover:bg-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {norm(query).length < 2 && (
              <p className="text-xs text-ink-muted text-center pt-10">
                কমপক্ষে ২টি অক্ষর লিখুন — Type CQ, Chapter CQ ও প্রশ্নপত্র একসাথে খোঁজা হবে
              </p>
            )}
            {norm(query).length >= 2 && !busy && total === 0 && (
              <p className="text-xs text-ink-muted text-center pt-10">কিছু পাওয়া যায়নি</p>
            )}
            {busy && <p className="text-xs text-ink-muted text-center">খোঁজা হচ্ছে…</p>}

            {groups.papers.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> প্রশ্নপত্র ({groups.papers.length})
                </h3>
                {groups.papers.map(({ paper }) => (
                  <button
                    key={paper.id}
                    type="button"
                    onClick={() => openPaper(paper.id)}
                    className="w-full text-left bg-surface border border-line rounded-2xl p-3 active:bg-press"
                  >
                    <p className="text-sm font-semibold truncate">{paper.title || paper.shortName}</p>
                    <p className="text-[0.7rem] text-ink-muted truncate">
                      {paper.category} · {paper.questionIds.length}টি প্রশ্ন
                    </p>
                  </button>
                ))}
              </section>
            )}

            {([
              ['type', 'Type CQ', Layers],
              ['chapter', 'Chapter CQ', BookOpen],
            ] as const).map(([key, label, Icon]) =>
              groups[key].length > 0 ? (
                <section key={key} className="space-y-2">
                  <h3 className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" /> {label} ({groups[key].length})
                  </h3>
                  {groups[key].map((hit) => (
                    <button
                      key={hit.question.id}
                      type="button"
                      onClick={() => openQuestion(hit)}
                      className="w-full text-left bg-surface border border-line rounded-2xl p-3 active:bg-press"
                    >
                      <p className="text-sm line-clamp-2">{plain(hit.question.questionText) || '(ছবি/খালি প্রশ্ন)'}</p>
                      <p className="text-[0.7rem] text-ink-muted truncate mt-1">
                        ({hit.question.type}) {hit.path}
                      </p>
                    </button>
                  ))}
                </section>
              ) : null
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default GlobalSearch;
