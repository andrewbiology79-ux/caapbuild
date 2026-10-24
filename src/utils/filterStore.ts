import { EMPTY_CRITERIA, type FilterCriteria, type SortMode } from './filterEngine';

/**
 * Filter-tab state that must survive switching tabs.
 * The tab screen unmounts when another tab is opened, so the state lives at module level
 * (and the chip order is also kept in localStorage so it survives an app restart).
 */
export type DropdownKey =
  | 'source'
  | 'chapter'
  | 'topic'
  | 'board'
  | 'year'
  | 'rating'
  | 'category'
  | 'type'
  | 'sort';

export const DEFAULT_DROPDOWN_ORDER: DropdownKey[] = [
  'source',
  'chapter',
  'topic',
  'board',
  'year',
  'rating',
  'category',
  'type',
  'sort',
];

const ORDER_KEY = 'qb_filter_dropdown_order_v1';

function loadOrder(): DropdownKey[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return [...DEFAULT_DROPDOWN_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_DROPDOWN_ORDER];
    const valid = parsed.filter((k): k is DropdownKey => DEFAULT_DROPDOWN_ORDER.includes(k));
    // add any dropdown introduced after the order was saved
    DEFAULT_DROPDOWN_ORDER.forEach((k) => {
      if (!valid.includes(k)) valid.push(k);
    });
    return [...new Set(valid)];
  } catch {
    return [...DEFAULT_DROPDOWN_ORDER];
  }
}

export function persistDropdownOrder(order: DropdownKey[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

export interface FilterTabState {
  criteria: FilterCriteria;
  searchInput: string;
  searchOpen: boolean;
  sort: SortMode;
  order: DropdownKey[];
}

export const filterTabState: FilterTabState = {
  criteria: EMPTY_CRITERIA,
  searchInput: '',
  searchOpen: false,
  sort: 'default',
  order: loadOrder(),
};
