import katex from 'katex';

export type Segment = { type: 'text' | 'math'; value: string };

const BENGALI = /[\u0980-\u09FF]/;

/**
 * Splits text into plain / math segments. "[ ... ]" becomes math unless it
 * contains Bengali letters (so "[গ]" or "[ঢাকা বোর্ড]" stay as text).
 * Escape a literal bracket with a backslash: \[ ... ]
 */
export function parseSegments(input: string): Segment[] {
  const out: Segment[] = [];
  const re = /(?<!\\)\[([^\[\]]+)\]/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push({ type: 'text', value: input.slice(last, m.index) });
    out.push(BENGALI.test(m[1]) ? { type: 'text', value: m[0] } : { type: 'math', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ type: 'text', value: input.slice(last) });
  return out;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');

/** HTML string with KaTeX pre-rendered (no JS needed in the WebView or PDF). */
export function toHtml(input: string): string {
  return parseSegments(input)
    .map((s) =>
      s.type === 'math'
        ? katex.renderToString(s.value, { throwOnError: false, output: 'html' })
        : esc(s.value),
    )
    .join('');
}

export const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
