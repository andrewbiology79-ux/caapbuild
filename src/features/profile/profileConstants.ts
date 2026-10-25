/** Shared types, sort options and storage keys of the Profile feature. */

export type CategorySortMode =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'newest'
  | 'oldest'
  | 'papers-desc'
  | 'papers-asc';

export const SORT_OPTIONS: Array<{ id: CategorySortMode; label: string }> = [
  { id: 'custom', label: 'আমার সাজানো ক্রম (রি-অর্ডার)' },
  { id: 'name-asc', label: 'নাম (অ → হ)' },
  { id: 'name-desc', label: 'নাম (হ → অ)' },
  { id: 'newest', label: 'নতুন আগে' },
  { id: 'oldest', label: 'পুরোনো আগে' },
  { id: 'papers-desc', label: 'বেশি প্রশ্নপত্র আগে' },
  { id: 'papers-asc', label: 'কম প্রশ্নপত্র আগে' },
];

export const CATEGORY_SORT_META_KEY = 'category_sort_mode';

export type PaperSortMode =
  | 'custom'
  | 'newest'
  | 'oldest'
  | 'name-asc'
  | 'name-desc'
  | 'questions-desc'
  | 'questions-asc';

export const PAPER_SORT_OPTIONS: Array<{ id: PaperSortMode; label: string }> = [
  { id: 'custom', label: 'আমার সাজানো ক্রম (রি-অর্ডার)' },
  { id: 'newest', label: 'নতুন আগে' },
  { id: 'oldest', label: 'পুরোনো আগে' },
  { id: 'name-asc', label: 'নাম (অ → হ)' },
  { id: 'name-desc', label: 'নাম (হ → অ)' },
  { id: 'questions-desc', label: 'বেশি প্রশ্ন আগে' },
  { id: 'questions-asc', label: 'কম প্রশ্ন আগে' },
];

export const PAPER_SORT_META_KEY = 'paper_sort_mode';

/** what the bottom bar of the paper multi-select mode shows */
export type PaperSelectPurpose = 'copy' | 'cut' | 'export' | 'pdf' | 'delete' | null;

export type ProfileViewMode = 'main' | 'categories' | 'category-detail';
