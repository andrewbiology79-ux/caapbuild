/**
 * A solution (সমাধান) is stored as the same two fields as before — `solutionText` and
 * `solutionImageIds` — so backups, imports and old data keep working.
 *
 * To remember WHERE a picture sits between pieces of text, the text carries tiny marker lines:
 *   [[img:<imageId>]]  → a picture goes here
 *   [[box]]            → separator between two text boxes that have no picture in between
 * Old solutions (no markers) simply show their pictures after the text.
 */

export type SolutionPart = { kind: 'text'; text: string } | { kind: 'image'; id: string };

const TOKEN_RE = /\n?\[\[(img:([^\]\s]+)|box)\]\]\n?/g;
/** Same pattern, used only for stripping (no capture-group side effects) */
const STRIP_RE = /\n?\[\[(?:img:[^\]\s]+|box)\]\]\n?/g;

/** Remove the marker lines — for search, plain text previews and the paper-only editor */
export function stripSolutionMarkers(text: string | undefined | null): string {
  if (!text) return '';
  return text.replace(STRIP_RE, '\n\n').trim();
}

export function parseSolution(text: string | undefined | null, imageIds: string[] | undefined | null): SolutionPart[] {
  const src = text || '';
  type Item = { t: 'text'; v: string } | { t: 'img'; id: string } | { t: 'box' };
  const items: Item[] = [];

  let last = 0;
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    items.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[2]) items.push({ t: 'img', id: m[2] });
    else items.push({ t: 'box' });
    last = re.lastIndex;
  }
  items.push({ t: 'text', v: src.slice(last) });

  // keep an empty text box only when it sits next to a [[box]] separator
  const parts: SolutionPart[] = [];
  items.forEach((it, i) => {
    if (it.t === 'img') {
      parts.push({ kind: 'image', id: it.id });
    } else if (it.t === 'text') {
      const nearBox = items[i - 1]?.t === 'box' || items[i + 1]?.t === 'box';
      if (it.v.trim() !== '' || nearBox) parts.push({ kind: 'text', text: it.v });
    }
  });

  // pictures saved without a marker (older data) go to the end
  const used = new Set(parts.filter((p) => p.kind === 'image').map((p) => (p as { id: string }).id));
  (imageIds || []).forEach((id) => {
    if (!used.has(id)) {
      parts.push({ kind: 'image', id });
      used.add(id);
    }
  });

  // pictures whose id is no longer in the list were removed
  const allowed = imageIds ? new Set(imageIds) : null;
  const cleaned = allowed ? parts.filter((p) => p.kind === 'text' || allowed.has(p.id)) : parts;

  // there is always at least one text box to type in
  if (!cleaned.some((p) => p.kind === 'text')) {
    cleaned.push({ kind: 'text', text: '' });
  }
  return cleaned;
}

export function serializeSolution(parts: SolutionPart[]): { text: string; imageIds: string[] } {
  const out: string[] = [];
  const imageIds: string[] = [];
  let prevText = false;
  for (const p of parts) {
    if (p.kind === 'text') {
      if (prevText) out.push('[[box]]');
      out.push(p.text);
      prevText = true;
    } else {
      out.push(`[[img:${p.id}]]`);
      imageIds.push(p.id);
      prevText = false;
    }
  }
  return { text: out.join('\n').trim(), imageIds };
}

/** Split a stimulus' pictures into the ones shown above the text and the ones below it */
export function splitStimulusImages(
  imageIds: string[] | undefined,
  topCount: number | undefined
): { top: string[]; bottom: string[] } {
  const ids = imageIds || [];
  const n = Math.max(0, Math.min(ids.length, Number.isFinite(topCount as number) ? (topCount as number) : 0));
  return { top: ids.slice(0, n), bottom: ids.slice(n) };
}
