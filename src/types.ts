export interface ImageAsset { id: string; uri: string }
export interface SourceTag { board: string; year?: number }          // e.g. "ঢাকা বোর্ড", 2023
export interface UsageRecord { examName: string; date: string }      // where/when a CQ was used
export interface Answer { html: string; images: ImageAsset[] }

/** মূল উদ্দীপক. Text may contain LaTeX wrapped in [ ... ] */
export interface Stimulus { text: string; images: ImageAsset[] }

export interface SubQuestion {
  label: 'গ' | 'ঘ';
  marks: number;
  text: string;                 // LaTeX in [ ... ]
  sources: SourceTag[];
  includeInCreate: boolean;     // right-side checkmark toggle
  answer?: Answer;              // saved from the rich-text answer modal
}

export interface Question {
  id: string;
  folderId: string;             // sub-topic FolderNode id
  stimulus: Stimulus;
  gha: SubQuestion;             // (গ)
  ghe: SubQuestion;             // (ঘ)
  difficulty: 0 | 1 | 2 | 3 | 4 | 5;
  usage: UsageRecord[];
  createdAt: number;
}

export type FolderLevel = 'subject' | 'paper' | 'chapter' | 'topic';
export interface FolderNode {
  id: string;
  parentId: string | null;
  level: FolderLevel;
  title: string;                // "05. কাজ, শক্তি ও ক্ষমতা"
  children: FolderNode[];       // empty for topics
}

export type ClipboardPayload = { mode: 'copy' | 'cut'; question: Question } | null;
