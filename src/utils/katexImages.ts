import katexCssRaw from 'katex/dist/katex.min.css?inline';

/**
 * Why this file exists
 * --------------------
 * html2canvas re-implements text drawing itself. For KaTeX formulas (many nested inline-blocks,
 * inline-tables and mixed fonts) it places the glyphs slightly LOWER than the browser does, so in
 * the PDF the formula sat below the Bangla text on the same line, while the in-app preview (drawn
 * by the real browser engine) was perfect.
 *
 * Fix: before html2canvas runs, every formula is drawn by the browser itself (SVG <foreignObject>,
 * KaTeX fonts embedded as data URIs) and swapped for an <img> that is aligned on the text baseline.
 * html2canvas then only has to copy a picture, and the formula lands exactly where the browser
 * laid it out.
 */

let cssPromise: Promise<string> | null = null;

async function urlToDataUri(url: string): Promise<string> {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** KaTeX stylesheet with the (woff2) fonts embedded, so an SVG image can use them. */
function getEmbeddedKatexCss(): Promise<string> {
  if (cssPromise) return cssPromise;
  cssPromise = (async () => {
    let css = katexCssRaw as string;
    // keep only the woff2 source of every font (smallest, supported by Android WebView)
    css = css.replace(/,\s*url\([^)]*\)\s*format\(["']?(?:woff|truetype)["']?\)/g, '');
    const urls = Array.from(new Set(Array.from(css.matchAll(/url\(([^)]+)\)/g)).map((m) => m[1])));
    for (const raw of urls) {
      const clean = raw.trim().replace(/^["']|["']$/g, '');
      if (clean.startsWith('data:')) continue;
      try {
        const abs = new URL(clean, document.baseURI).href;
        const data = await urlToDataUri(abs);
        css = css.split(raw).join(`"${data}"`);
      } catch (e) {
        console.warn('KaTeX font could not be embedded:', clean, e);
      }
    }
    return css;
  })();
  return cssPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('formula image failed'));
    img.src = src;
  });
}

const PAD = 3; // px of breathing room so thin glyph edges / accents are never clipped

/**
 * Replace every `.katex` formula inside `root` by a baseline-aligned image drawn by the browser.
 * Call it when the layout is final (after pagination), right before html2canvas.
 * Any formula that cannot be converted is simply left as normal HTML.
 */
export async function replaceKatexWithImages(root: HTMLElement): Promise<void> {
  const css = await getEmbeddedKatexCss();
  const formulas = Array.from(root.querySelectorAll<HTMLElement>('.katex')).filter(
    (el) => !el.parentElement?.closest('.katex')
  );

  // 1) measure every formula in a neutral off-screen box (same CSS, same font size as in the page)
  const jobs: Array<{
    el: HTMLElement;
    w: number;
    h: number;
    boxDescent: number;
    extraTop: number;
    extraBottom: number;
    offsetTop: number;
    parentFontPx: number;
    color: string;
    html: string;
  }> = [];

  for (const el of formulas) {
    const parent = el.parentElement as HTMLElement | null;
    if (!parent || el.getBoundingClientRect().width === 0) continue;
    const parentFontPx = parseFloat(getComputedStyle(parent).fontSize) || 12;
    const color = getComputedStyle(el).color || '#111827';

    const probe = document.createElement('div');
    probe.style.cssText =
      `position:absolute;left:-99999px;top:0;margin:0;padding:0;white-space:nowrap;line-height:normal;` +
      `font-size:${parentFontPx}px;color:${color};`;
    probe.innerHTML = el.outerHTML;
    document.body.appendChild(probe);
    try {
      const k = probe.querySelector<HTMLElement>('.katex');
      const bases = Array.from(probe.querySelectorAll<HTMLElement>('.katex-html > .base'));
      const strut = probe.querySelector<HTMLElement>('.strut');
      if (!k || !strut || bases.length === 0) continue;

      const pr = probe.getBoundingClientRect();
      const kr = k.getBoundingClientRect();
      let top = Infinity;
      let bottom = -Infinity;
      for (const b of bases) {
        const r = b.getBoundingClientRect();
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      const strutRect = strut.getBoundingClientRect();
      // a formula wrapped onto several lines cannot be aligned safely -> keep it as normal HTML
      if (bases.length > 1 && bottom - top > strutRect.height * 1.9) continue;

      const strutFont = parseFloat(getComputedStyle(strut).fontSize) || parentFontPx;
      const vaMatch = /vertical-align:\s*(-?[\d.]+)em/.exec(strut.getAttribute('style') || '');
      const dropEm = vaMatch ? -parseFloat(vaMatch[1]) : 0; // strut hangs this far below the baseline
      const baselineY = strutRect.bottom - dropEm * strutFont;

      // ink can stick out of the inline-block box (tall fractions, big brackets): include everything
      let inkTop = top;
      let inkBottom = bottom;
      probe.querySelectorAll<HTMLElement>('*').forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        inkTop = Math.min(inkTop, r.top);
        inkBottom = Math.max(inkBottom, r.bottom);
      });
      inkTop = Math.max(inkTop, top - parentFontPx);
      inkBottom = Math.min(inkBottom, bottom + parentFontPx);

      void pr;
      jobs.push({
        el,
        w: Math.ceil(kr.width),
        h: Math.ceil(inkBottom - inkTop),
        boxDescent: bottom - baselineY,
        extraTop: top - inkTop,
        extraBottom: inkBottom - bottom,
        offsetTop: inkTop - pr.top,
        parentFontPx,
        color,
        html: new XMLSerializer().serializeToString(el),
      });
    } finally {
      document.body.removeChild(probe);
    }
  }

  // 2) render each formula natively -> <img>
  const images: Array<HTMLImageElement | null> = [];
  for (const j of jobs) {
    try {
      const W = j.w + PAD * 2;
      const H = j.h + PAD * 2;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
        `<foreignObject x="0" y="0" width="${W}" height="${H}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="position:absolute;left:${PAD}px;top:${PAD - j.offsetTop}px;` +
        `font-size:${j.parentFontPx}px;line-height:normal;color:${j.color};white-space:nowrap;margin:0;padding:0;">` +
        `<style>${css.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</style>${j.html}</div></foreignObject></svg>`;
      const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      img.alt = '';
      img.style.width = `${W}px`;
      img.style.height = `${H}px`;
      img.style.maxWidth = 'none';
      img.style.display = 'inline-block';
      // the image's margin box equals the formula's own box, so the surrounding line is unchanged
      img.style.verticalAlign = `${-j.boxDescent}px`;
      img.style.margin = `${-(PAD + j.extraTop)}px ${-PAD}px ${-(PAD + j.extraBottom)}px`;
      img.style.padding = '0';
      img.style.border = 'none';
      images.push(img);
    } catch (e) {
      console.warn('Formula could not be rendered as image, keeping HTML:', e);
      images.push(null);
    }
  }

  // 3) swap in one go
  jobs.forEach((j, i) => {
    const img = images[i];
    if (img) j.el.replaceWith(img);
  });
}
