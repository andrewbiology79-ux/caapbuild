import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Pause, Timer, Trophy, Trash2, Check } from 'lucide-react';
import { db, type Paper, type Question, type Stimulus } from '../db/db';
import { generateId, getImageBlobUrl } from '../db/api';
import { getQuestionsByIds, getStimuliByIds } from '../db/crossDb';
import { RichText } from './RichText';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { useNavigation } from '../utils/navigation';
import { Button } from '../ui/Button';
import { toBn } from '../utils/toBn';
import {
  breakdownByChapter,
  breakdownByType,
  deleteExamResult,
  formatDuration,
  getExamResults,
  parseDurationMinutes,
  resolveQuestionLocations,
  percentOf,
  saveExamResult,
  type ExamResult,
} from '../utils/examResults';

type Phase = 'setup' | 'running' | 'scoring' | 'result';

interface Group {
  stimulus?: Stimulus;
  questions: Question[];
}

export interface ExamModalProps {
  paperId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });

const Bar: React.FC<{ percent: number }> = ({ percent }) => (
  <div className="h-2 rounded-full bg-line overflow-hidden">
    <div
      className={`h-full rounded-full ${percent >= 70 ? 'bg-success' : percent >= 40 ? 'bg-brand' : 'bg-danger'}`}
      style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
    />
  </div>
);

export const ExamModal: React.FC<ExamModalProps> = ({ paperId, isOpen, onClose }) => {
  const { showToast } = useToast();
  const { registerBackHandler } = useNavigation();

  const [phase, setPhase] = useState<Phase>('setup');
  const [paper, setPaper] = useState<Paper | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<ExamResult[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [previous, setPrevious] = useState<ExamResult | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [saving, setSaving] = useState(false);

  const endAtRef = useRef(0);
  const pausedRef = useRef(false);
  const durationRef = useRef(0);
  const remainingRef = useRef(0);
  remainingRef.current = remaining;
  pausedRef.current = paused;

  const flatQuestions = useMemo(() => groups.flatMap((g) => g.questions), [groups]);
  const totalMarks = useMemo(() => flatQuestions.reduce((s, q) => s + (q.marks || 0), 0), [flatQuestions]);

  /* ---------- load paper + questions ---------- */
  useEffect(() => {
    if (!isOpen || !paperId) return;
    let cancelled = false;
    setPhase('setup');
    setScores({});
    setResult(null);
    setPaused(false);

    (async () => {
      try {
        const p = await db.papers.get(paperId);
        if (!p || cancelled) return;
        setPaper(p);
        setMinutes(parseDurationMinutes(p.duration, 60));

        const list = await getQuestionsByIds(p.questionIds || []);
        list.sort((a, b) => p.questionIds.indexOf(a.id) - p.questionIds.indexOf(b.id));

        const stimIds = Array.from(new Set(list.map((q) => q.stimulusId).filter(Boolean))) as string[];
        const stimMap = new Map<string, Stimulus>();
        if (stimIds.length) (await getStimuliByIds(stimIds)).forEach((s) => stimMap.set(s.id, s));

        const grouped: Group[] = [];
        const byStim = new Map<string, Group>();
        for (const q of list) {
          const st = q.stimulusId ? stimMap.get(q.stimulusId) : undefined;
          if (st) {
            let g = byStim.get(st.id);
            if (!g) {
              g = { stimulus: st, questions: [] };
              byStim.set(st.id, g);
              grouped.push(g);
            }
            g.questions.push(q);
          } else {
            grouped.push({ questions: [q] });
          }
        }
        if (cancelled) return;
        setGroups(grouped);

        const urls: Record<string, string> = {};
        for (const g of grouped) {
          for (const id of g.stimulus?.imageIds || []) {
            const u = await getImageBlobUrl(id);
            if (u) urls[id] = u;
          }
        }
        if (!cancelled) setImageUrls(urls);

        const all = await getExamResults();
        if (!cancelled) setHistory(all.filter((r) => r.paperId === p.id));
      } catch (err) {
        console.error('Failed to load exam:', err);
        showToast('পরীক্ষা লোড করা যায়নি');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, paperId]);

  /* ---------- timer ---------- */
  const goToScoring = useCallback(() => {
    setPhase('scoring');
    setPaused(false);
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        showToast('সময় শেষ! এবার প্রাপ্ত নম্বর দিন', 3500);
        goToScoring();
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [phase, goToScoring]);

  const startExam = () => {
    const sec = Math.max(1, minutes) * 60;
    durationRef.current = sec;
    endAtRef.current = Date.now() + sec * 1000;
    setRemaining(sec);
    setPaused(false);
    setScores({});
    setPhase('running');
  };

  const togglePause = () => {
    if (paused) {
      endAtRef.current = Date.now() + remainingRef.current * 1000;
      setPaused(false);
    } else {
      setPaused(true);
    }
  };

  /* ---------- back button ---------- */
  const requestClose = useCallback(() => {
    if (phase === 'running' || phase === 'scoring') setConfirmExit(true);
    else onClose();
  }, [phase, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const off = registerBackHandler(() => {
      requestClose();
      return true;
    });
    return off;
  }, [isOpen, registerBackHandler, requestClose]);

  /* ---------- scoring / result ---------- */
  const clampScore = (q: Question): number => {
    const v = parseFloat(scores[q.id] ?? '');
    if (!Number.isFinite(v)) return 0;
    return Math.min(q.marks || 0, Math.max(0, v));
  };
  const gotTotal = flatQuestions.reduce((s, q) => s + clampScore(q), 0);

  const submitScores = async () => {
    if (!paper || saving) return;
    setSaving(true);
    try {
      const usedSec = Math.max(0, durationRef.current - remainingRef.current);
      const locations = await resolveQuestionLocations(flatQuestions);
      const res: ExamResult = {
        id: generateId(),
        paperId: paper.id,
        paperName: paper.shortName,
        takenAt: Date.now(),
        durationSec: durationRef.current,
        usedSec,
        totalMarks,
        gotMarks: gotTotal,
        items: flatQuestions.map((q) => ({
          questionId: q.id,
          type: q.type,
          marks: q.marks || 0,
          got: clampScore(q),
          rating: q.rating,
          chapter: locations.get(q.id)?.chapter,
          topic: locations.get(q.id)?.topic,
        })),
      };
      setPrevious(history[0] ?? null);
      await saveExamResult(res);
      setResult(res);
      setHistory((h) => [res, ...h]);
      setPhase('result');
    } catch (err) {
      console.error(err);
      showToast('ফলাফল সেভ করা যায়নি');
    } finally {
      setSaving(false);
    }
  };

  const removeResult = async (id: string) => {
    await deleteExamResult(id);
    setHistory((h) => h.filter((r) => r.id !== id));
  };

  if (!isOpen || !paper) return null;

  const lowOnTime = phase === 'running' && remaining <= 300;

  /* ---------- views ---------- */
  const renderSetup = () => {
    const best = history.reduce((m, r) => Math.max(m, percentOf(r)), 0);
    const avg = history.length ? Math.round(history.reduce((s, r) => s + percentOf(r), 0) / history.length) : 0;
    const types = breakdownByType(history);
    const allChapters = breakdownByChapter(history);
    return (
      <div className="p-4 space-y-4">
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-card space-y-3">
          <p className="text-sm font-bold text-ink">{paper.title || paper.shortName}</p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-brand-soft py-2">
              <p className="text-lg font-black text-brand-ink">{toBn(flatQuestions.length)}</p>
              <p className="text-[0.6875rem] text-ink-muted">প্রশ্ন</p>
            </div>
            <div className="rounded-xl bg-brand-soft py-2">
              <p className="text-lg font-black text-brand-ink">{toBn(totalMarks)}</p>
              <p className="text-[0.6875rem] text-ink-muted">পূর্ণমান</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink">সময় (মিনিট)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="সময় কমান"
                onClick={() => setMinutes((m) => Math.max(5, m - 5))}
                className="w-9 h-9 min-h-0 rounded-lg border border-line text-brand-fg font-black"
              >
                −
              </button>
              <span className="min-w-[48px] text-center text-sm font-black text-ink">{toBn(minutes)}</span>
              <button
                type="button"
                aria-label="সময় বাড়ান"
                onClick={() => setMinutes((m) => Math.min(360, m + 5))}
                className="w-9 h-9 min-h-0 rounded-lg border border-line text-brand-fg font-black"
              >
                +
              </button>
            </div>
          </div>
          <Button block onClick={startExam} disabled={flatQuestions.length === 0}>
            <Play className="w-4 h-4" /> পরীক্ষা শুরু করুন
          </Button>
          {flatQuestions.length === 0 && (
            <p className="text-xs text-danger text-center">এই প্রশ্নপত্রে কোনো প্রশ্ন নেই</p>
          )}
        </div>

        {history.length > 0 && (
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-brand-fg" /> আগের ফলাফল
              </p>
              <p className="text-[0.6875rem] text-ink-muted">
                সেরা {toBn(best)}% · গড় {toBn(avg)}%
              </p>
            </div>
            {history.slice(0, 6).map((r) => (
              <div key={r.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">{fmtDate(r.takenAt)}</span>
                  <span className="font-bold text-ink">
                    {toBn(r.gotMarks)}/{toBn(r.totalMarks)} ({toBn(percentOf(r))}%)
                  </span>
                  <button
                    type="button"
                    aria-label="ফলাফল মুছুন"
                    onClick={() => removeResult(r.id)}
                    className="w-7 h-7 min-h-0 flex items-center justify-center text-ink-muted hover:text-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Bar percent={percentOf(r)} />
              </div>
            ))}
            {types.length > 0 && (
              <div className="pt-2 border-t border-line space-y-1.5">
                <p className="text-xs font-bold text-ink">সব পরীক্ষায় ধরন অনুযায়ী</p>
                {types.map((t) => (
                  <div key={t.type} className="flex items-center gap-2 text-xs">
                    <span className="w-5 font-bold text-brand-ink">{t.type}</span>
                    <div className="flex-1"><Bar percent={t.percent} /></div>
                    <span className="w-10 text-right text-ink-muted">{toBn(t.percent)}%</span>
                  </div>
                ))}
              </div>
            )}
            {allChapters.length > 0 && (
              <div className="pt-2 border-t border-line space-y-1.5">
                <p className="text-xs font-bold text-ink">সব পরীক্ষায় অধ্যায় অনুযায়ী (দুর্বল আগে)</p>
                {allChapters.slice(0, 8).map((c) => (
                  <div key={c.chapter} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex-1 min-w-0 truncate text-ink">{c.chapter}</span>
                      <span className="text-ink-muted">{toBn(c.percent)}%</span>
                    </div>
                    <Bar percent={c.percent} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderQuestions = (withScoreInputs: boolean) => (
    <div className="p-3 space-y-3">
      {groups.map((g, gi) => (
        <div key={gi} className="bg-surface border border-line rounded-2xl p-3 shadow-card space-y-2">
          <div className="flex items-start gap-2 text-sm">
            <span className="font-black text-ink shrink-0">{toBn(gi + 1)}।</span>
            {g.stimulus && <RichText text={g.stimulus.text} className="text-sm flex-1 min-w-0" />}
          </div>
          {g.stimulus?.imageIds?.map((id) =>
            imageUrls[id] ? (
              <img key={id} src={imageUrls[id]} alt="উদ্দীপক চিত্র" className="w-full max-h-[260px] object-contain rounded-lg bg-white" />
            ) : null
          )}
          <div className="space-y-2 pl-2">
            {g.questions.map((q) => (
              <div key={q.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="flex items-start gap-1 flex-1 min-w-0">
                  <span className="font-bold text-ink shrink-0">{q.type}.</span>
                  <RichText text={q.questionText} className="text-sm flex-1 min-w-0" />
                </div>
                {withScoreInputs ? (
                  <div className="shrink-0 flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={q.marks}
                      step={0.5}
                      value={scores[q.id] ?? ''}
                      onChange={(e) => setScores((s) => ({ ...s, [q.id]: e.target.value }))}
                      placeholder="০"
                      aria-label={`${q.type} প্রশ্নের প্রাপ্ত নম্বর`}
                      className="w-14 h-9 px-2 rounded-lg border border-line bg-app text-ink text-sm text-center select-text focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <span className="text-xs text-ink-muted">/{toBn(q.marks)}</span>
                  </div>
                ) : (
                  <span className="font-bold text-ink text-xs shrink-0">{toBn(q.marks)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderResult = () => {
    if (!result) return null;
    const pct = percentOf(result);
    const types = breakdownByType([result]);
    const chapters = breakdownByChapter([result]);
    const weakest = [...types].filter((t) => t.marks > 0).sort((a, b) => a.percent - b.percent)[0];
    const diff = previous ? pct - percentOf(previous) : null;
    return (
      <div className="p-4 space-y-4">
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-card text-center space-y-1">
          <p className="text-xs text-ink-muted">আপনার ফলাফল</p>
          <p className="text-4xl font-black text-brand-ink">
            {toBn(result.gotMarks)}<span className="text-lg text-ink-muted">/{toBn(result.totalMarks)}</span>
          </p>
          <p className="text-sm font-bold text-ink">{toBn(pct)}%</p>
          <p className="text-xs text-ink-muted">
            সময় লেগেছে {toBn(formatDuration(result.usedSec))} / {toBn(formatDuration(result.durationSec))}
          </p>
          {diff !== null && (
            <p className={`text-xs font-bold ${diff >= 0 ? 'text-success' : 'text-danger'}`}>
              আগের বারের চেয়ে {diff >= 0 ? '+' : '−'}{toBn(Math.abs(diff))}%
            </p>
          )}
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-card space-y-2">
          <p className="text-sm font-bold text-ink">প্রশ্নের ধরন অনুযায়ী</p>
          {types.map((t) => (
            <div key={t.type} className="flex items-center gap-2 text-xs">
              <span className="w-5 font-bold text-brand-ink">{t.type}</span>
              <div className="flex-1"><Bar percent={t.percent} /></div>
              <span className="w-24 text-right text-ink-muted">
                {toBn(t.got)}/{toBn(t.marks)} ({toBn(t.percent)}%)
              </span>
            </div>
          ))}
          {weakest && weakest.percent < 70 && (
            <p className="text-xs text-ink-muted pt-1">
              সবচেয়ে দুর্বল: <span className="font-bold text-danger">{weakest.type}</span> ধরনের প্রশ্ন — এগুলোতে আরও অনুশীলন করুন।
            </p>
          )}
        </div>
        {chapters.length > 0 && (
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-card space-y-3">
            <p className="text-sm font-bold text-ink">অধ্যায় ও টপিক অনুযায়ী</p>
            {chapters.map((c) => (
              <div key={c.chapter} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex-1 min-w-0 truncate font-bold text-brand-ink">{c.chapter}</span>
                  <span className="text-ink-muted">
                    {toBn(c.got)}/{toBn(c.marks)} ({toBn(c.percent)}%)
                  </span>
                </div>
                <Bar percent={c.percent} />
                {c.topics.length > 1 &&
                  c.topics.map((t) => (
                    <div key={t.topic} className="flex items-center gap-2 text-[0.6875rem] pl-3 text-ink-muted">
                      <span className="flex-1 min-w-0 truncate">{t.topic}</span>
                      <span>{toBn(t.percent)}%</span>
                    </div>
                  ))}
              </div>
            ))}
            {chapters[0].percent < 70 && (
              <p className="text-xs text-ink-muted">
                সবচেয়ে দুর্বল অধ্যায়: <span className="font-bold text-danger">{chapters[0].chapter}</span>
              </p>
            )}
          </div>
        )}
        <Button block onClick={onClose}>
          <Check className="w-4 h-4" /> শেষ
        </Button>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="পরীক্ষা মোড"
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4"
    >
      <div className="w-full max-w-[390px] h-full sm:h-[844px] bg-app text-ink flex flex-col relative overflow-hidden shadow-2xl sm:rounded-[36px] border border-line">
        <header
          className={`${lowOnTime ? 'bg-danger-strong' : 'bg-brand'} text-white px-4 h-14 flex items-center justify-between shrink-0 shadow-md transition-colors`}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              aria-label="বন্ধ করুন"
              onClick={requestClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-bold truncate max-w-[150px]">
              {phase === 'scoring' ? 'নম্বর দিন' : phase === 'result' ? 'ফলাফল' : paper.shortName}
            </h2>
          </div>
          {phase === 'running' && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-base font-black tabular-nums">
                <Timer className="w-4 h-4" />
                {toBn(formatDuration(remaining))}
              </span>
              <button
                type="button"
                aria-label={paused ? 'চালু করুন' : 'বিরতি'}
                onClick={togglePause}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 text-white"
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          {phase === 'setup' && renderSetup()}
          {phase === 'running' &&
            (paused ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm font-bold text-ink">পরীক্ষা বিরতিতে আছে</p>
                <p className="text-xs text-ink-muted">প্রশ্ন দেখতে চালু করুন</p>
                <Button onClick={togglePause}><Play className="w-4 h-4" /> চালু করুন</Button>
              </div>
            ) : (
              renderQuestions(false)
            ))}
          {phase === 'scoring' && (
            <div>
              <p className="px-4 pt-3 text-xs text-ink-muted">
                উত্তর নিজে মিলিয়ে প্রতিটি প্রশ্নের প্রাপ্ত নম্বর লিখুন (না লিখলে ০ ধরা হবে)।
              </p>
              {renderQuestions(true)}
            </div>
          )}
          {phase === 'result' && renderResult()}
        </div>

        {phase === 'running' && (
          <div className="shrink-0 p-3 bg-surface border-t border-line" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
            <Button block variant="secondary" onClick={() => setConfirmFinish(true)}>
              পরীক্ষা শেষ করুন
            </Button>
          </div>
        )}
        {phase === 'scoring' && (
          <div className="shrink-0 p-3 bg-surface border-t border-line flex items-center gap-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
            <p className="text-sm font-bold text-ink whitespace-nowrap">
              {toBn(gotTotal)}/{toBn(totalMarks)}
            </p>
            <Button block onClick={submitScores} disabled={saving}>
              {saving ? 'সেভ হচ্ছে…' : 'ফলাফল দেখুন'}
            </Button>
          </div>
        )}

        <ConfirmDialog
          isOpen={confirmFinish}
          title="পরীক্ষা শেষ করবেন?"
          message="এবার নিজের উত্তর মিলিয়ে নম্বর দিতে হবে।"
          confirmText="হ্যাঁ, শেষ করুন"
          cancelText="চালিয়ে যান"
          onConfirm={() => {
            setConfirmFinish(false);
            goToScoring();
          }}
          onCancel={() => setConfirmFinish(false)}
        />
        <ConfirmDialog
          isOpen={confirmExit}
          title="পরীক্ষা বাতিল করবেন?"
          message="এখন বের হলে এই পরীক্ষার ফলাফল সেভ হবে না।"
          confirmText="বাতিল করুন"
          cancelText="থাকুন"
          isDestructive={true}
          onConfirm={() => {
            setConfirmExit(false);
            onClose();
          }}
          onCancel={() => setConfirmExit(false)}
        />
      </div>
    </div>
  );
};

export default ExamModal;
