/**
 * Renders a LaTeX formula to a crisp PNG that is placed inline in the PDF page.
 *
 * Why: html2canvas draws every piece of text itself and positions each glyph with its own
 * font-metric guess. KaTeX mixes several fonts (KaTeX_Main, KaTeX_Math, ...) whose ascents differ,
 * so formulas ended up a few pixels lower/higher than the surrounding Bengali text in the PDF
 * (the in-app preview is fine because there the browser itself paints the text).
 *
 * Here the *browser* paints the formula (SVG <foreignObject> with the KaTeX fonts embedded),
 * and we hand html2canvas a plain <img>. html2canvas only has to place an image on a baseline,
 * which it does exactly like the browser does.
 */
import katex from 'katex';

/**
 * One horizontally cropped slice of a formula. Slices are cut where KaTeX allows a line break
 * (its top-level ".base" boxes), so long formulas wrap in the PDF exactly like in the app.
 */
export interface MathSlice {
  /** PNG data URL */
  url: string;
  /** Image size in CSS px, including the transparent padding */
  width: number;
  height: number;
  /** Negative margins that cancel the padding so that only the real formula box takes up space */
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Distance (CSS px) from the formula baseline down to the bottom of the slice's layout box */
  descent: number;
}

export interface MathImage {
  slices: MathSlice[];
}

export interface MathResources {
  /** Raw text of katex.min.css */
  css: string;
  /** Returns the URL of a KaTeX font file (e.g. "KaTeX_Main-Regular.woff2") */
  resolveFontUrl: (fileName: string) => string | undefined;
}

let resources: MathResources | null = null;

/**
 * The app's global CSS (Tailwind preflight etc.) is not present inside the SVG picture, so the
 * measuring box and the picture must both use the same neutral rules.
 */
const HOST_CLASS = 'mathimg-host';
const HOST_CSS = `.${HOST_CLASS},.${HOST_CLASS} *{box-sizing:border-box;}`;

export function configureMathImages(r: MathResources): void {
  resources = r;
  faceCache = null;
}

interface FontFace {
  family: string;
  style: string; // normal | italic
  weight: string; // 400 | 700
  file: string; // *.woff2
}

let faceCache: { faces: FontFace[]; baseCss: string } | null = null;
const fontDataCache = new Map<string, Promise<string>>();
const imageCache = new Map<string, MathImage | null>();

/** Splits katex.min.css into its @font-face list and the remaining rules */
function parseKatexCss(): { faces: FontFace[]; baseCss: string } {
  if (faceCache) return faceCache;
  const css = resources?.css ?? '';
  const faces: FontFace[] = [];
  const baseCss = css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    const family = /font-family:\s*([^;}]+)/.exec(block)?.[1]?.replace(/["']/g, '').trim();
    const style = /font-style:\s*([^;}]+)/.exec(block)?.[1]?.trim() ?? 'normal';
    const weight = /font-weight:\s*([^;}]+)/.exec(block)?.[1]?.trim() ?? 'normal';
    const file = /url\(\s*["']?[^)"']*?([^/)"']+\.woff2)["']?\s*\)/.exec(block)?.[1];
    if (family && file) {
      faces.push({ family, style, weight: weight === 'bold' ? '700' : weight === 'normal' ? '400' : weight, file });
    }
    return '';
  });
  faceCache = { faces, baseCss };
  return faceCache;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fontDataUrl(file: string): Promise<string> {
  let p = fontDataCache.get(file);
  if (!p) {
    p = (async () => {
      const url = resources?.resolveFontUrl(file);
      if (!url) throw new Error(`KaTeX font not found: ${file}`);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`KaTeX font fetch failed: ${file}`);
      return `data:font/woff2;base64,${bufferToBase64(await resp.arrayBuffer())}`;
    })();
    p.catch(() => fontDataCache.delete(file));
    fontDataCache.set(file, p);
  }
  return p;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** Which KaTeX font faces the rendered formula actually uses */
function usedFaces(root: HTMLElement, faces: FontFace[]): FontFace[] {
  const used = new Set<FontFace>();
  const els: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of els) {
    let hasText = false;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && (n.textContent || '').trim()) {
        hasText = true;
        break;
      }
    }
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const style = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique' ? 'italic' : 'normal';
    const weight = parseInt(cs.fontWeight, 10) >= 600 ? '700' : '400';
    const sameFamily = faces.filter((f) => f.family === family);
    if (sameFamily.length === 0) continue;
    const exact = sameFamily.find((f) => f.style === style && f.weight === weight);
    const styleOnly = sameFamily.find((f) => f.style === style);
    used.add(exact || styleOnly || sameFamily[0]);
  }
  return Array.from(used);
}

/**
 * Renders one formula. `fontPx` is the font size of the surrounding text; the formula itself is
 * drawn at `fontPx * mathEm` (same 1.04em the PDF text path always used).
 * Returns null when anything goes wrong so the caller can fall back to plain KaTeX HTML.
 */
async function renderFormula(
  tex: string,
  displayMode: boolean,
  fontPx: number,
  mathEm: number,
  canvasScale: number
): Promise<MathImage | null> {
  if (!resources) return null;
  const { faces, baseCss } = parseKatexCss();

  const host = document.createElement('div');
  host.className = HOST_CLASS;
  host.style.cssText =
    'position:absolute;left:-9999px;top:0;margin:0;padding:0;background:#fff;color:#000;pointer-events:none;';
  const hostStyle = document.createElement('style');
  hostStyle.textContent = HOST_CSS;
  host.appendChild(hostStyle);
  document.body.appendChild(host);

  try {
    const html = katex
      .renderToString(tex, { displayMode, throwOnError: false, output: 'html' })
      .replace(
        /class="(katex-display|katex)"/g,
        (_m: string, cls: string) =>
          cls === 'katex-display'
            ? 'class="katex-display" style="display:inline-block;margin:0;padding:0;overflow:visible;max-width:none;"'
            : `class="katex" style="font-size:${mathEm}em;overflow:visible;max-width:none;"`
      );

    const wrapStyle = `display:inline-block;white-space:nowrap;margin:0;padding:0;color:#000;font:normal ${fontPx}px KaTeX_Main,serif;line-height:1.2;`;
    const wrap = document.createElement('span');
    wrap.style.cssText = wrapStyle;
    wrap.innerHTML = html;
    host.appendChild(wrap);

    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;';
    wrap.appendChild(probe);

    // Make sure the faces are loaded in this document before measuring
    const neededFaces = usedFaces(wrap, faces);
    await Promise.all(
      neededFaces.map((f) =>
        document.fonts
          ? document.fonts.load(`${f.style} ${f.weight} ${fontPx}px ${f.family}`).catch(() => [])
          : Promise.resolve([])
      )
    );
    void host.offsetHeight;

    // Box of the formula = KaTeX's top-level ".base" boxes. Their struts already cover the full
    // height/depth of the content. (Do NOT union all descendants: stretchy parts such as the
    // sqrt/arrow <svg>s are hundreds of em wide and only clipped by an ancestor.)
    const wrapRect = wrap.getBoundingClientRect();
    const bases: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    wrap.querySelectorAll<HTMLElement>('.katex-html > .base').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bases.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    });
    if (bases.length === 0) return null;
    bases.sort((x, y) => x.left - y.left);
    const left = bases[0].left;
    const right = Math.max(...bases.map((x) => x.right));
    const top = Math.min(...bases.map((x) => x.top));
    const bottom = Math.max(...bases.map((x) => x.bottom));
    const baselineY = probe.getBoundingClientRect().bottom;
    wrap.removeChild(probe);

    const PAD_X = 2; // room for italic overhang / accents
    const PAD_Y = 2;
    const height = bottom - top + PAD_Y * 2;
    const fullWidth = right - left + PAD_X * 2;
    const offX = wrapRect.left - left + PAD_X;
    const offY = wrapRect.top - top + PAD_Y;

    // Embed only the font faces this formula needs
    const fontCss = (
      await Promise.all(
        neededFaces.map(async (f) => {
          const data = await fontDataUrl(f.file);
          return `@font-face{font-family:${f.family};font-style:${f.style};font-weight:${f.weight};src:url(${data}) format("woff2");}`;
        })
      )
    ).join('');

    const root = document.createElement('div');
    root.className = HOST_CLASS;
    root.style.cssText = `position:absolute;left:${offX}px;top:${offY}px;margin:0;padding:0;`;
    const styleEl = document.createElement('style');
    styleEl.textContent = fontCss + baseCss + HOST_CSS;
    root.appendChild(styleEl);
    root.appendChild(wrap.cloneNode(true));

    const xhtml = new XMLSerializer().serializeToString(root);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fullWidth}" height="${height}" viewBox="0 0 ${fullWidth} ${height}">` +
      `<foreignObject x="0" y="0" width="${fullWidth}" height="${height}">${xhtml}</foreignObject></svg>`;
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

    const rasterise = async (): Promise<HTMLCanvasElement> => {
      const img = new Image();
      img.src = svgUrl;
      await withTimeout(img.decode(), 5000);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(fullWidth * canvasScale);
      canvas.height = Math.round(height * canvasScale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.getImageData(0, 0, 1, 1); // throws if the canvas got tainted
      return canvas;
    };

    // Fonts are embedded as data URLs, so the first pass normally already has the glyphs. If a
    // WebView still draws a blank picture (fonts not decoded yet) try once more, then give up
    // so the caller falls back to the plain KaTeX HTML.
    const hasInk = (c: HTMLCanvasElement): boolean => {
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 16) return true;
      return false;
    };
    let full = await rasterise();
    if (!hasInk(full)) {
      await new Promise((r) => setTimeout(r, 60));
      full = await rasterise();
      if (!hasInk(full)) throw new Error('formula picture is blank');
    }

    // Cut the full picture into one slice per ".base". Padding is added only on the outer edges of
    // the formula: at inner cuts a neighbour's pixels would show up when the line wraps there.
    const slices: MathSlice[] = [];
    bases.forEach((bs, i) => {
      const isFirst = i === 0;
      const isLast = i === bases.length - 1;
      // Full picture: x = 0 is (left - PAD_X), y = 0 is (top - PAD_Y)
      const x0 = isFirst ? 0 : bs.left - left + PAD_X;
      const x1 = isLast ? fullWidth : bases[i + 1].left - left + PAD_X;
      const y0 = bs.top - top;
      const y1 = bs.bottom - top + PAD_Y * 2;
      const sx = Math.round(x0 * canvasScale);
      const sy = Math.round(y0 * canvasScale);
      const sw = Math.max(1, Math.round((x1 - x0) * canvasScale));
      const sh = Math.max(1, Math.round((y1 - y0) * canvasScale));
      const c = document.createElement('canvas');
      c.width = sw;
      c.height = sh;
      c.getContext('2d')!.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
      slices.push({
        url: c.toDataURL('image/png'),
        width: x1 - x0,
        height: y1 - y0,
        marginTop: -PAD_Y,
        marginBottom: -PAD_Y,
        marginLeft: isFirst ? -PAD_X : 0,
        marginRight: isLast ? -PAD_X : 0,
        descent: bs.bottom - baselineY,
      });
    });
    return { slices };
  } catch (err) {
    console.warn('Formula image render failed, falling back to HTML:', tex, err);
    return null;
  } finally {
    host.remove();
  }
}

export function mathKey(tex: string, displayMode: boolean, fontPx: number): string {
  return `${displayMode ? 'D' : 'I'}|${fontPx}|${tex}`;
}

/** Every `$...$` / `$$...$$` formula found in the given texts */
export function collectFormulas(texts: Array<string | undefined>): Array<{ tex: string; displayMode: boolean }> {
  const regex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g;
  const found = new Map<string, { tex: string; displayMode: boolean }>();
  for (const text of texts) {
    if (!text) continue;
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((m = regex.exec(text)) !== null) {
      const token = m[0];
      const displayMode = token.startsWith('$$') && token.endsWith('$$');
      const tex = (displayMode ? token.slice(2, -2) : token.slice(1, -1)).trim();
      found.set(`${displayMode}|${tex}`, { tex, displayMode });
    }
  }
  return Array.from(found.values());
}

/** Renders all formulas (one after another to keep memory low) */
export async function prepareMathImages(
  formulas: Array<{ tex: string; displayMode: boolean }>,
  fontPx: number,
  options: { mathEm?: number; canvasScale?: number } = {}
): Promise<Map<string, MathImage>> {
  const { mathEm = 1.04, canvasScale = 3 } = options;
  const out = new Map<string, MathImage>();
  for (const f of formulas) {
    const key = mathKey(f.tex, f.displayMode, fontPx);
    let img = imageCache.get(key);
    if (img === undefined) {
      img = await renderFormula(f.tex, f.displayMode, fontPx, mathEm, canvasScale);
      if (img) imageCache.set(key, img); // failures are retried next time
    }
    if (img) out.set(key, img);
  }
  return out;
}
