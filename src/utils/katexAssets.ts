/**
 * Gives mathImages.ts the KaTeX stylesheet text and font file URLs (bundled by Vite, so the PDF
 * export keeps working fully offline).
 */
import katexCss from 'katex/dist/katex.min.css?raw';
import { configureMathImages } from './mathImages';

// Hashed URLs of the KaTeX font files, e.g. { 'KaTeX_Main-Regular.woff2': '/assets/KaTeX_Main-Regular-xxxx.woff2' }
const bundledFonts = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fontUrlByName: Record<string, string> = {};
for (const [path, url] of Object.entries(bundledFonts)) {
  fontUrlByName[path.split('/').pop() as string] = url;
}

/** Fallback: read the URL from the @font-face rules the page already loaded */
function findFontUrlInStyleSheets(fileName: string): string | undefined {
  const stem = fileName.replace(/\.woff2$/, '');
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const src = rule.style.getPropertyValue('src');
      // stem must be a whole file name: "KaTeX_Main-Bold" must not match "KaTeX_Main-BoldItalic-xxxx"
      const m = new RegExp(
        `url\\(["']?([^"')]*?(?<![A-Za-z0-9_-])${stem}(?:-[A-Za-z0-9_]+)?\\.woff2)["']?\\)`
      ).exec(src);
      if (m) return new URL(m[1], sheet.href || document.baseURI).toString();
    }
  }
  return undefined;
}

configureMathImages({
  css: katexCss,
  resolveFontUrl: (fileName) => fontUrlByName[fileName] ?? findFontUrlInStyleSheets(fileName),
});
