import type { Paper, Question, Stimulus } from '../db/db';
import { getApi } from '../db/api';
import { generateAndSharePdf } from './pdfGenerator';
import type { FilterRow } from './filterEngine';

export interface FilterPdfOptions {
  title: string;
  subjectLine?: string;
  duration?: string;
  /** undefined = default দ্রষ্টব্য, '' = hidden */
  note?: string;
  fontScale?: number;
  fileBaseName?: string;
}

/**
 * Build one PDF from rows of BOTH collections (Type CQ + Chapter CQ).
 * Rows keep the order they are given; questions sharing a stimulus are printed together.
 */
export async function exportRowsToPdf(rows: FilterRow[], opts: FilterPdfOptions): Promise<string | undefined> {
  if (rows.length === 0) throw new Error('কোনো প্রশ্ন সিলেক্ট করা হয়নি।');

  const groups: Array<{ stimulus?: Stimulus; questions: Question[] }> = [];
  const byStimulus = new Map<string, { stimulus?: Stimulus; questions: Question[] }>();

  for (const row of rows) {
    if (row.stimulus) {
      const gk = `${row.source}:${row.stimulus.id}`;
      let g = byStimulus.get(gk);
      if (!g) {
        g = { stimulus: row.stimulus, questions: [] };
        byStimulus.set(gk, g);
        groups.push(g);
      }
      g.questions.push(row.question);
    } else {
      groups.push({ questions: [row.question] });
    }
  }

  // Image blob URLs — each image is read from the database its question came from
  const urls: Record<string, string> = {};
  for (const row of rows) {
    const api = getApi(row.source);
    const ids = [...(row.stimulus?.imageIds ?? []), ...(row.question.solutionImageIds ?? [])];
    for (const imgId of ids) {
      if (urls[imgId]) continue;
      const url = await api.getImageBlobUrl(imgId);
      if (url) urls[imgId] = url;
    }
  }

  const totalMarks = rows.reduce((sum, r) => sum + (r.question.marks || 0), 0);
  const title = opts.title.trim() || 'প্রশ্নব্যাংক';

  const paper: Paper = {
    id: `filter_${Date.now()}`,
    shortName: opts.fileBaseName?.trim() || title,
    category: '',
    createdAt: Date.now(),
    title,
    subjectLine: opts.subjectLine?.trim() || undefined,
    note: opts.note,
    duration: opts.duration?.trim() || undefined,
    totalMarks: totalMarks || undefined,
    questionIds: rows.map((r) => r.question.id),
  };

  return await generateAndSharePdf({
    paper,
    groupedQuestions: groups,
    imageUrls: urls,
    fontScale: opts.fontScale,
    fileBaseName: opts.fileBaseName?.trim() || undefined,
  });
}
