import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import katex from 'katex';
import { toBn } from './toBn';
import { db, type Paper, type Question, type Stimulus } from '../db/db';
import { getImageBlobUrl } from '../db/api';
import { ensureStorageAccess, savePdfToPhoneStorage } from './storageAccess';
import { getPdfFontScale, normalizePdfFontScale } from './settings';

export interface GeneratePdfOptions {
  paper: Paper;
  groupedQuestions: Array<{ stimulus?: Stimulus; questions: Question[] }>;
  imageUrls?: Record<string, string>;
  /** PDF text size multiplier (1 = 100%). If omitted, the last saved size is used. */
  fontScale?: number;
}

/**
 * Render RichText string with LaTeX to HTML string for A4 PDF column
 */
function renderRichTextToHtml(rawText: string): string {
  if (!rawText) return '';

  // Matches $$...$$ or $...$
  const regex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let html = '';

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  while ((match = regex.exec(rawText)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      html += escapeHtml(rawText.substring(lastIndex, matchIndex));
    }

    const token = match[0];
    const isBlock = token.startsWith('$$') && token.endsWith('$$');
    const mathContent = isBlock ? token.slice(2, -2).trim() : token.slice(1, -1).trim();

    try {
      // `output: 'html'` skips the hidden MathML copy; the inline overflow reset is essential:
      // the app-wide `.katex { overflow: auto/hidden }` rule moves the formula's baseline to its
      // bottom edge, which is what made formulas sit lower than the surrounding text in the PDF.
      const rendered = katex
        .renderToString(mathContent, {
          displayMode: isBlock,
          throwOnError: false,
          output: 'html',
        })
        .replace(
          /class="(katex-display|katex)"/g,
          'class="$1" style="overflow: visible; max-width: none; padding: 0; margin-top: 0; margin-bottom: 0;"'
        );

      if (isBlock) {
        html += `<div style="text-align: center; margin: 4px 0; max-width: 100%; overflow: visible; padding: 0; font-size: 0.95em;">${rendered}</div>`;
      } else {
        // Plain inline + baseline alignment: formula baseline == text baseline on the same line
        html += `<span style="display: inline; vertical-align: baseline; margin: 0 1px; overflow: visible; padding: 0; font-size: 0.95em;">${rendered}</span>`;
      }
    } catch {
      html += escapeHtml(token);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    html += escapeHtml(rawText.substring(lastIndex));
  }

  return html;
}

/**
 * Convert SVG text to crisp high-res PNG Base64 Data URL via canvas
 * Ensures html2canvas-pro can render vectors, text, and lines with 100% reliability
 */
async function convertSvgToPngDataUrl(svgText: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    throw new Error('Invalid SVG content');
  }

  // Determine intrinsic dimensions from viewBox or attributes
  let width = 380;
  let height = 220;

  const vb = svgEl.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2];
      height = parts[3];
    }
  } else {
    const attrW = parseFloat(svgEl.getAttribute('width') || '');
    const attrH = parseFloat(svgEl.getAttribute('height') || '');
    if (!isNaN(attrW) && attrW > 0) width = attrW;
    if (!isNaN(attrH) && attrH > 0) height = attrH;
  }

  // Force explicit pixel width and height on SVG element for consistent rendering
  svgEl.setAttribute('width', String(width));
  svgEl.setAttribute('height', String(height));
  if (!svgEl.getAttribute('xmlns')) {
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const serialized = new XMLSerializer().serializeToString(svgEl);
  const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Timeout safety fallback
    const timer = setTimeout(() => {
      resolve(svgDataUri);
    }, 2000);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const scale = 2; // 2x for sharp print quality
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(100, Math.round(width * scale));
        canvas.height = Math.max(60, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(svgDataUri);
          return;
        }

        // Crisp white background so transparent SVGs render beautifully on paper
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png', 1.0);
        resolve(pngUrl);
      } catch (err) {
        console.warn('Canvas export failed for SVG, falling back to data URI:', err);
        resolve(svgDataUri);
      }
    };

    img.onerror = (err) => {
      clearTimeout(timer);
      console.warn('Image load failed for SVG, using direct SVG data URI:', err);
      resolve(svgDataUri);
    };

    img.src = svgDataUri;
  });
}

/**
 * Robustly resolve any image Blob to a self-contained base64 Data URL
 * Converts SVGs to high-res PNG data URLs, and JPEGs/PNGs to Base64
 */
async function resolveImageToDataUrl(blob: Blob, fileName = ''): Promise<string> {
  const isSvg =
    blob.type.includes('svg') ||
    fileName.toLowerCase().endsWith('.svg');

  if (isSvg) {
    try {
      const text = await blob.text();
      if (text.includes('<svg')) {
        return await convertSvgToPngDataUrl(text);
      }
    } catch (err) {
      console.warn('Failed to parse SVG blob, falling back to base64 DataURL:', err);
    }
  }

  // Standard FileReader to DataURL for PNG, JPG, or fallback
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('ফাইল রূপান্তরে ব্যর্থ হয়েছে'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('ফাইল রিডিংয়ে সমস্যা'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Wait for web fonts and all images inside container to finish loading and decoding
 */
async function waitForFontsAndImages(container: HTMLElement): Promise<void> {
  // Force a layout first so the browser actually starts loading the fonts used here
  // (otherwise `fonts.ready` can resolve before KaTeX/Bangla fonts are requested).
  void container.offsetHeight;
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            if (img.decode) {
              img.decode().then(resolve).catch(resolve);
            } else {
              resolve();
            }
          } else {
            img.onload = () => {
              if (img.decode) {
                img.decode().then(resolve).catch(resolve);
              } else {
                resolve();
              }
            };
            img.onerror = () => resolve();
          }
        })
    )
  );
}

/**
 * Convert Blob to Base64 (stripping the "data:...;base64," prefix)
 */
async function blobToBase64Only(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result) {
        reject(new Error('ফাইল রিডার কোনো ডাটা পায়নি'));
        return;
      }
      const base64Only = result.split(',')[1] || '';
      resolve(base64Only);
    };
    reader.onerror = () => reject(reader.error || new Error('ফাইল রূপান্তরে ব্যর্থ হয়েছে'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Build Header element for the first page (full width spanning both columns)
 */
function buildPaperHeaderElement(paper: Paper, k = 1): HTMLElement {
  const px = (n: number) => `${+(n * k).toFixed(2)}px`;
  const headerDiv = document.createElement('div');
  headerDiv.style.textAlign = 'center';
  headerDiv.style.paddingBottom = '8px';
  headerDiv.style.marginBottom = '12px';
  headerDiv.style.borderBottom = '2px solid #000000';
  headerDiv.style.boxSizing = 'border-box';
  headerDiv.style.width = '100%';

  // Title
  const titleEl = document.createElement('h1');
  titleEl.textContent = paper.title || 'প্রশ্নপত্র';
  titleEl.style.fontSize = px(18);
  titleEl.style.fontWeight = '900';
  titleEl.style.color = '#000000';
  titleEl.style.margin = '0 0 3px 0';
  titleEl.style.lineHeight = '1.3';
  titleEl.style.overflowWrap = 'anywhere';
  titleEl.style.wordBreak = 'break-word';
  titleEl.style.whiteSpace = 'pre-wrap';
  titleEl.style.maxWidth = '100%';
  headerDiv.appendChild(titleEl);

  // Subject line
  if (paper.subjectLine) {
    const subEl = document.createElement('p');
    subEl.textContent = paper.subjectLine;
    subEl.style.fontSize = px(12);
    subEl.style.fontWeight = 'bold';
    subEl.style.color = '#000000';
    subEl.style.margin = '0 0 4px 0';
    subEl.style.overflowWrap = 'anywhere';
    subEl.style.wordBreak = 'break-word';
    headerDiv.appendChild(subEl);
  }

  // Time & Total Marks row
  const metaRow = document.createElement('div');
  metaRow.style.display = 'flex';
  metaRow.style.justifyContent = 'space-between';
  metaRow.style.alignItems = 'center';
  metaRow.style.fontSize = px(11.5);
  metaRow.style.fontWeight = 'bold';
  metaRow.style.color = '#000000';
  metaRow.style.paddingTop = '2px';

  const durationSpan = document.createElement('span');
  durationSpan.textContent = `সময়: ${paper.duration || '২ ঘণ্টা ৩০ মিনিট'}`;
  const marksSpan = document.createElement('span');
  marksSpan.textContent = `পূর্ণমান: ${toBn(paper.totalMarks || 50)}`;

  metaRow.appendChild(durationSpan);
  metaRow.appendChild(marksSpan);
  headerDiv.appendChild(metaRow);

  // Instruction Notice
  const noteDiv = document.createElement('div');
  noteDiv.textContent =
    '[ দ্রষ্টব্য: ডান পাশের সংখ্যা প্রশ্নের পূর্ণমান নির্দেশক। প্রয়োজনীয় ক্ষেত্রে চিত্র অঙ্কন আবশ্যক। ]';
  noteDiv.style.textAlign = 'center';
  noteDiv.style.fontSize = px(10);
  noteDiv.style.fontWeight = '600';
  noteDiv.style.fontStyle = 'italic';
  noteDiv.style.color = '#333333';
  noteDiv.style.paddingTop = '5px';
  headerDiv.appendChild(noteDiv);

  return headerDiv;
}

/**
 * Build mini running header for subsequent pages (Page 2, 3...)
 */
function buildMiniHeaderElement(paper: Paper, k = 1): HTMLElement {
  const px = (n: number) => `${+(n * k).toFixed(2)}px`;
  const miniHeader = document.createElement('div');
  miniHeader.style.display = 'flex';
  miniHeader.style.justifyContent = 'space-between';
  miniHeader.style.alignItems = 'center';
  miniHeader.style.paddingBottom = '4px';
  miniHeader.style.marginBottom = '10px';
  miniHeader.style.borderBottom = '1px solid #D1D5DB';
  miniHeader.style.fontSize = px(10);
  miniHeader.style.fontWeight = 'bold';
  miniHeader.style.color = '#4B5563';
  miniHeader.style.width = '100%';
  miniHeader.style.boxSizing = 'border-box';

  const leftSpan = document.createElement('span');
  leftSpan.textContent = paper.shortName || paper.title || 'প্রশ্নপত্র';
  const rightSpan = document.createElement('span');
  rightSpan.textContent = `পূর্ণমান: ${toBn(paper.totalMarks || 50)}`;

  miniHeader.appendChild(leftSpan);
  miniHeader.appendChild(rightSpan);
  return miniHeader;
}

/**
 * Build Question Group Block DOM Element designed specifically for a 350px column
 */
function buildQuestionGroupElement(
  group: { stimulus?: Stimulus; questions: Question[] },
  gIdx: number,
  imageUrls: Record<string, string>,
  colWidthPx = 350,
  k = 1
): HTMLElement {
  const px = (n: number) => `${+(n * k).toFixed(2)}px`;
  const block = document.createElement('div');
  block.style.paddingBottom = '10px';
  block.style.marginBottom = '10px';
  block.style.borderBottom = '1px solid #E5E7EB';
  block.style.boxSizing = 'border-box';
  block.style.width = `${colWidthPx}px`;
  block.style.maxWidth = `${colWidthPx}px`;
  block.style.overflowWrap = 'anywhere';
  block.style.wordBreak = 'break-word';

  // Question Serial + Stimulus Text on the same row (stimulus starts right beside the serial number)
  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.justifyContent = 'flex-start';
  topRow.style.alignItems = 'baseline';
  topRow.style.gap = '6px';
  topRow.style.marginBottom = '6px';
  topRow.style.width = '100%';

  const serialSpan = document.createElement('span');
  serialSpan.textContent = `${toBn(gIdx + 1)}।`;
  serialSpan.style.fontWeight = '900';
  serialSpan.style.fontSize = px(13);
  serialSpan.style.color = '#000000';
  serialSpan.style.flexShrink = '0';
  topRow.appendChild(serialSpan);

  // Stimulus Text
  if (group.stimulus?.text) {
    const stimTextDiv = document.createElement('div');
    stimTextDiv.innerHTML = renderRichTextToHtml(group.stimulus.text);
    stimTextDiv.style.fontSize = px(11.5);
    stimTextDiv.style.fontWeight = '500';
    stimTextDiv.style.color = '#111827';
    stimTextDiv.style.lineHeight = '1.55';
    stimTextDiv.style.flex = '1';
    stimTextDiv.style.minWidth = '0';
    stimTextDiv.style.overflowWrap = 'anywhere';
    stimTextDiv.style.wordBreak = 'break-word';
    stimTextDiv.style.whiteSpace = 'pre-wrap';
    topRow.appendChild(stimTextDiv);
  }
  block.appendChild(topRow);

  // Stimulus Images (Sized to fit column nicely, large enough to read, with neat container)
  if (group.stimulus?.imageIds && group.stimulus.imageIds.length > 0) {
    for (const imgId of group.stimulus.imageIds) {
      const url = imageUrls[imgId];
      if (url) {
        const imgWrap = document.createElement('div');
        imgWrap.style.textAlign = 'center';
        imgWrap.style.margin = '4px 0';
        imgWrap.style.width = '100%';
        imgWrap.style.boxSizing = 'border-box';

        const img = document.createElement('img');
        img.src = url;
        img.alt = 'উদ্দীপক চিত্র';
        // Fill width nicely, but never overflow column; allow screenshots enough height to be readable
        img.style.maxWidth = '78%';
        img.style.width = 'auto';
        img.style.height = 'auto';
        img.style.maxHeight = '150px';
        img.style.objectFit = 'contain';
        img.style.display = 'block';
        img.style.margin = '0 auto';
        // No border / rounded frame / padding around images in the exported PDF
        img.style.border = 'none';
        img.style.outline = 'none';
        img.style.borderRadius = '0';
        img.style.padding = '0';
        img.style.boxShadow = 'none';
        img.style.backgroundColor = '#ffffff';
        img.style.boxSizing = 'border-box';

        imgWrap.appendChild(img);
        block.appendChild(imgWrap);
      }
    }
  }

  // Sub-questions (গ, ঘ)
  const subWrap = document.createElement('div');
  subWrap.style.paddingLeft = '4px';
  subWrap.style.marginTop = '4px';
  subWrap.style.display = 'flex';
  subWrap.style.flexDirection = 'column';
  subWrap.style.gap = '6px';
  subWrap.style.width = '100%';

  group.questions.forEach((q, qIdx) => {
    const qRow = document.createElement('div');
    qRow.style.display = 'flex';
    qRow.style.alignItems = 'baseline';
    qRow.style.justifyContent = 'space-between';
    qRow.style.gap = '6px';
    qRow.style.width = '100%';
    qRow.style.fontSize = px(11.5);
    qRow.style.lineHeight = '1.45';

    // Left container for label and question text
    const qLeft = document.createElement('div');
    qLeft.style.display = 'flex';
    qLeft.style.alignItems = 'baseline';
    qLeft.style.gap = '4px';
    qLeft.style.flex = '1';
    qLeft.style.minWidth = '0';
    qLeft.style.maxWidth = `calc(100% - ${px(24)})`;

    // Label: "গ." or "(১)"
    const labelSpan = document.createElement('span');
    labelSpan.textContent = q.type ? `${q.type}.` : `(${toBn(qIdx + 1)})`;
    labelSpan.style.fontWeight = 'bold';
    labelSpan.style.color = '#000000';
    labelSpan.style.flexShrink = '0';
    qLeft.appendChild(labelSpan);

    // Text: with full word wrap and KaTeX
    const textSpan = document.createElement('span');
    textSpan.innerHTML = renderRichTextToHtml(q.questionText || '');
    textSpan.style.flex = '1';
    textSpan.style.minWidth = '0';
    textSpan.style.color = '#111827';
    textSpan.style.overflowWrap = 'anywhere';
    textSpan.style.wordBreak = 'break-word';
    textSpan.style.whiteSpace = 'pre-wrap';
    textSpan.style.maxWidth = '100%';
    qLeft.appendChild(textSpan);

    qRow.appendChild(qLeft);

    // Right column for marks (always visible on the right, never pushed off)
    const marksSpan = document.createElement('span');
    marksSpan.textContent = toBn(q.marks);
    marksSpan.style.fontWeight = 'bold';
    marksSpan.style.color = '#000000';
    marksSpan.style.flexShrink = '0';
    marksSpan.style.textAlign = 'right';
    marksSpan.style.paddingLeft = '4px';
    marksSpan.style.minWidth = px(18);
    qRow.appendChild(marksSpan);

    subWrap.appendChild(qRow);
  });

  block.appendChild(subWrap);
  return block;
}

interface PageSlot {
  pageDiv: HTMLElement;
  col1Div: HTMLElement;
  col2Div: HTMLElement;
  dividerDiv: HTMLElement;
  footerDiv: HTMLElement;
  maxColHeight: number;
  col1UsedHeight: number;
  col2UsedHeight: number;
}

/**
 * Main PDF Generation and Delivery Function
 * - Strict 2-column examination layout:
 *   - Column 1 fills first, then flows to Column 2 of the same page.
 *   - When both columns of a page are complete, flows to Column 1 of the next page.
 *   - Questions are NEVER cut across columns or pages!
 * - SVG vector graphics rasterized to crisp 2x PNG canvas data URIs so they display 100% reliably.
 * - JPG/PNG images sized appropriately to fit column width without shrinking into unreadability.
 * - jsPDF A4 portrait with html2canvas-pro.
 */
export async function generateAndSharePdf(options: GeneratePdfOptions): Promise<string | undefined> {
  const { paper, groupedQuestions, imageUrls = {} } = options;
  // Use the size passed in, otherwise the last size the user picked (remembered in settings)
  const fontScale =
    options.fontScale !== undefined ? normalizePdfFontScale(options.fontScale) : await getPdfFontScale();
  const fileName = `${paper.shortName || 'question-paper'}.pdf`;

  // Hidden container for staging and measurement
  const hiddenRoot = document.createElement('div');
  hiddenRoot.style.position = 'absolute';
  hiddenRoot.style.left = '-9999px';
  hiddenRoot.style.top = '0px';
  hiddenRoot.style.width = '794px';
  hiddenRoot.style.background = '#ffffff';
  hiddenRoot.style.color = '#111827';
  hiddenRoot.style.fontFamily = "'Hind Siliguri', serif";
  hiddenRoot.style.boxSizing = 'border-box';
  hiddenRoot.style.zIndex = '-9999';
  document.body.appendChild(hiddenRoot);

  try {
    // 1. Resolve ALL images to high-res Base64 DataURLs (SVG -> Canvas PNG, JPG/PNG -> Base64)
    const resolvedImageUrls: Record<string, string> = { ...imageUrls };
    const allImageIds: string[] = [];

    for (const g of groupedQuestions) {
      if (g.stimulus?.imageIds) {
        allImageIds.push(...g.stimulus.imageIds);
      }
      for (const q of g.questions) {
        if (q.solutionImageIds) {
          allImageIds.push(...q.solutionImageIds);
        }
      }
    }

    for (const imgId of allImageIds) {
      const imgRecord = await db.images.get(imgId);
      if (imgRecord?.blob) {
        try {
          resolvedImageUrls[imgId] = await resolveImageToDataUrl(imgRecord.blob, imgRecord.fileName);
        } catch (e) {
          console.warn('Could not resolve image to DataURL:', e);
        }
      } else if (resolvedImageUrls[imgId]?.startsWith('blob:')) {
        try {
          const resp = await fetch(resolvedImageUrls[imgId]);
          const blob = await resp.blob();
          resolvedImageUrls[imgId] = await resolveImageToDataUrl(blob);
        } catch (e) {
          console.warn('Could not fetch blob URL:', e);
        }
      }
    }

    // A4 Dimensions:
    // Total: 794px x 1123px.
    // Horizontal Margins: 34px left, 34px right -> Usable Width = 726px.
    // Two Columns: Column 1 (350px) + Gap/Divider (24px) + Column 2 (350px) = 724px.
    // Vertical Margins: 32px top, 32px bottom -> Usable Height = 1059px.
    // Footer height: 24px -> Content Height = 1035px.
    const PAGE_WIDTH_PX = 794;
    const PAGE_HEIGHT_PX = 1123;
    const PAGE_PAD_TOP = 32;
    const PAGE_PAD_BOTTOM = 32;
    const PAGE_PAD_HORIZ = 34;
    const FOOTER_HEIGHT_PX = 24;
    const COL_WIDTH_PX = 350;
    const USABLE_PAGE_HEIGHT = PAGE_HEIGHT_PX - PAGE_PAD_TOP - PAGE_PAD_BOTTOM - FOOTER_HEIGHT_PX; // 1035px

    // Measurement helper container
    const measureContainer = document.createElement('div');
    measureContainer.style.width = `${COL_WIDTH_PX}px`;
    measureContainer.style.boxSizing = 'border-box';
    measureContainer.style.position = 'absolute';
    measureContainer.style.left = '0px';
    measureContainer.style.top = '0px';
    measureContainer.style.visibility = 'hidden';
    hiddenRoot.appendChild(measureContainer);

    // Measure Header (full width: 726px)
    const headerEl = buildPaperHeaderElement(paper, fontScale);
    measureContainer.style.width = '726px';
    measureContainer.appendChild(headerEl);
    await waitForFontsAndImages(measureContainer);
    const headerHeight = headerEl.getBoundingClientRect().height || headerEl.offsetHeight;
    measureContainer.removeChild(headerEl);

    // Measure Mini Header for subsequent pages (726px)
    const miniHeaderSample = buildMiniHeaderElement(paper, fontScale);
    measureContainer.appendChild(miniHeaderSample);
    const miniHeaderHeight = miniHeaderSample.getBoundingClientRect().height || miniHeaderSample.offsetHeight;
    measureContainer.removeChild(miniHeaderSample);

    // Switch back to column width for question measurements
    measureContainer.style.width = `${COL_WIDTH_PX}px`;

    // Measure each question group
    const measuredGroups: Array<{ element: HTMLElement; height: number }> = [];
    for (let i = 0; i < groupedQuestions.length; i++) {
      const blockEl = buildQuestionGroupElement(groupedQuestions[i], i, resolvedImageUrls, COL_WIDTH_PX, fontScale);
      measureContainer.appendChild(blockEl);
      await waitForFontsAndImages(measureContainer);
      const h = blockEl.getBoundingClientRect().height || blockEl.offsetHeight;
      measureContainer.removeChild(blockEl);
      measuredGroups.push({ element: blockEl, height: Math.ceil(h) });
    }

    // Measure End marker ("— সমাপ্ত —")
    const endMarkerEl = document.createElement('div');
    endMarkerEl.textContent = '— সমাপ্ত —';
    endMarkerEl.style.textAlign = 'center';
    endMarkerEl.style.fontSize = `${+(11 * fontScale).toFixed(2)}px`;
    endMarkerEl.style.fontWeight = 'bold';
    endMarkerEl.style.color = '#4B5563';
    endMarkerEl.style.paddingTop = '8px';
    endMarkerEl.style.paddingBottom = '8px';
    measureContainer.appendChild(endMarkerEl);
    const endMarkerHeight = Math.ceil(endMarkerEl.getBoundingClientRect().height || endMarkerEl.offsetHeight);
    measureContainer.removeChild(endMarkerEl);

    // Clean up measurement container
    hiddenRoot.removeChild(measureContainer);

    // 2. Two-Column Pagination Factory
    const pageSlots: PageSlot[] = [];

    const createPageSlot = (isFirstPage: boolean): PageSlot => {
      const pageDiv = document.createElement('div');
      pageDiv.style.width = `${PAGE_WIDTH_PX}px`;
      pageDiv.style.height = `${PAGE_HEIGHT_PX}px`;
      pageDiv.style.padding = `${PAGE_PAD_TOP}px ${PAGE_PAD_HORIZ}px ${PAGE_PAD_BOTTOM}px ${PAGE_PAD_HORIZ}px`;
      pageDiv.style.boxSizing = 'border-box';
      pageDiv.style.overflow = 'hidden';
      pageDiv.style.background = '#ffffff';
      pageDiv.style.color = '#111827';
      pageDiv.style.fontFamily = "'Hind Siliguri', serif";
      pageDiv.style.display = 'flex';
      pageDiv.style.flexDirection = 'column';
      pageDiv.style.position = 'relative';

      // Header row
      if (isFirstPage) {
        pageDiv.appendChild(headerEl);
      } else {
        const miniH = buildMiniHeaderElement(paper, fontScale);
        pageDiv.appendChild(miniH);
      }

      // Columns Row
      const columnsRow = document.createElement('div');
      columnsRow.style.display = 'flex';
      columnsRow.style.flexDirection = 'row';
      columnsRow.style.justifyContent = 'space-between';
      columnsRow.style.alignItems = 'stretch';
      columnsRow.style.width = '100%';
      columnsRow.style.flex = '1';
      columnsRow.style.minHeight = '0';
      columnsRow.style.boxSizing = 'border-box';

      // Column 1
      const col1Div = document.createElement('div');
      col1Div.style.width = `${COL_WIDTH_PX}px`;
      col1Div.style.maxWidth = `${COL_WIDTH_PX}px`;
      col1Div.style.display = 'flex';
      col1Div.style.flexDirection = 'column';
      col1Div.style.boxSizing = 'border-box';

      // Center Divider line
      const dividerDiv = document.createElement('div');
      dividerDiv.style.width = '1px';
      dividerDiv.style.backgroundColor = '#D1D5DB';
      dividerDiv.style.margin = '0 10px';
      dividerDiv.style.flexShrink = '0';
      dividerDiv.style.alignSelf = 'stretch';
      dividerDiv.style.transition = 'opacity 0.2s';

      // Column 2
      const col2Div = document.createElement('div');
      col2Div.style.width = `${COL_WIDTH_PX}px`;
      col2Div.style.maxWidth = `${COL_WIDTH_PX}px`;
      col2Div.style.display = 'flex';
      col2Div.style.flexDirection = 'column';
      col2Div.style.boxSizing = 'border-box';

      columnsRow.appendChild(col1Div);
      columnsRow.appendChild(dividerDiv);
      columnsRow.appendChild(col2Div);
      pageDiv.appendChild(columnsRow);

      // Footer with Page Number
      const footerDiv = document.createElement('div');
      footerDiv.style.height = `${FOOTER_HEIGHT_PX}px`;
      footerDiv.style.display = 'flex';
      footerDiv.style.alignItems = 'center';
      footerDiv.style.justifyContent = 'center';
      footerDiv.style.fontSize = '10px';
      footerDiv.style.fontWeight = '600';
      footerDiv.style.color = '#6B7280';
      footerDiv.style.boxSizing = 'border-box';
      footerDiv.style.marginTop = '4px';
      pageDiv.appendChild(footerDiv);

      hiddenRoot.appendChild(pageDiv);

      const topUsed = isFirstPage ? headerHeight + 12 : miniHeaderHeight + 10;
      const maxColHeight = Math.max(250, USABLE_PAGE_HEIGHT - topUsed);

      const slot: PageSlot = {
        pageDiv,
        col1Div,
        col2Div,
        dividerDiv,
        footerDiv,
        maxColHeight,
        col1UsedHeight: 0,
        col2UsedHeight: 0,
      };

      pageSlots.push(slot);
      return slot;
    };

    // 3. Two-Column Distribution Algorithm:
    //    Column 1 fills first -> then flows to Column 2 of the same page ->
    //    when Column 2 is full -> flows to Column 1 of the NEXT page!
    let currentSlot = createPageSlot(true);
    let activeCol: 1 | 2 = 1;

    for (const item of measuredGroups) {
      const blockEl = item.element;
      const blockH = item.height;

      if (activeCol === 1) {
        if (currentSlot.col1UsedHeight + blockH <= currentSlot.maxColHeight) {
          currentSlot.col1Div.appendChild(blockEl);
          currentSlot.col1UsedHeight += blockH;
        } else {
          // Column 1 is full! Move to Column 2 of the same page
          activeCol = 2;
          if (currentSlot.col2UsedHeight + blockH <= currentSlot.maxColHeight) {
            currentSlot.col2Div.appendChild(blockEl);
            currentSlot.col2UsedHeight += blockH;
          } else {
            // If block doesn't fit in Column 2 (or Col 2 was already full)
            if (currentSlot.col2UsedHeight === 0) {
              // Col 2 is empty, place it here to ensure forward progress
              currentSlot.col2Div.appendChild(blockEl);
              currentSlot.col2UsedHeight += blockH;
            } else {
              // Open new page and place in Column 1
              currentSlot = createPageSlot(false);
              activeCol = 1;
              currentSlot.col1Div.appendChild(blockEl);
              currentSlot.col1UsedHeight = blockH;
            }
          }
        }
      } else {
        // activeCol === 2
        if (currentSlot.col2UsedHeight + blockH <= currentSlot.maxColHeight) {
          currentSlot.col2Div.appendChild(blockEl);
          currentSlot.col2UsedHeight += blockH;
        } else {
          // Both columns on this page are full!
          // Open a new page and place in Column 1
          currentSlot = createPageSlot(false);
          activeCol = 1;
          currentSlot.col1Div.appendChild(blockEl);
          currentSlot.col1UsedHeight = blockH;
        }
      }
    }

    // Place End Marker ("— সমাপ্ত —")
    if (activeCol === 1) {
      if (currentSlot.col1UsedHeight + endMarkerHeight <= currentSlot.maxColHeight) {
        currentSlot.col1Div.appendChild(endMarkerEl);
        currentSlot.col1UsedHeight += endMarkerHeight;
      } else {
        // Put in Column 2
        currentSlot.col2Div.appendChild(endMarkerEl);
        currentSlot.col2UsedHeight += endMarkerHeight;
      }
    } else {
      if (currentSlot.col2UsedHeight + endMarkerHeight <= currentSlot.maxColHeight) {
        currentSlot.col2Div.appendChild(endMarkerEl);
        currentSlot.col2UsedHeight += endMarkerHeight;
      } else {
        currentSlot.col2Div.appendChild(endMarkerEl);
      }
    }

    // Update divider visibility and page footers
    const totalPages = pageSlots.length;
    for (let k = 0; k < pageSlots.length; k++) {
      const slot = pageSlots[k];
      // If column 2 has content, keep vertical divider visible; otherwise hide to avoid orphan line
      if (slot.col2UsedHeight > 0) {
        slot.dividerDiv.style.opacity = '1';
      } else {
        slot.dividerDiv.style.opacity = '0';
      }
      slot.footerDiv.textContent = `— পৃষ্ঠা ${toBn(k + 1)} / ${toBn(totalPages)} —`;
    }

    // 4. Wait for all fonts and images inside all pages
    await waitForFontsAndImages(hiddenRoot);

    // 5. Render each page div to jsPDF using html2canvas-pro
    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
    });

    for (let i = 0; i < pageSlots.length; i++) {
      if (i > 0) {
        pdf.addPage();
      }

      const canvas = await html2canvas(pageSlots[i].pageDiv, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: PAGE_WIDTH_PX,
        height: PAGE_HEIGHT_PX,
        windowWidth: PAGE_WIDTH_PX,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      // Fit A4 210mm x 297mm exactly
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    const pdfBlob = pdf.output('blob');

    // 6. Deliver PDF to Android or Web Browser
    if (Capacitor.isNativePlatform()) {
      const base64Only = await blobToBase64Only(pdfBlob);

      // Preferred: save directly into the phone storage (asks "All files access" permission if needed)
      try {
        const allowed = await ensureStorageAccess();
        if (allowed) {
          return await savePdfToPhoneStorage(base64Only, paper.shortName || 'question-paper');
        }
      } catch (saveErr) {
        console.warn('Direct PDF save failed, falling back to share sheet:', saveErr);
      }

      // Fallback: share sheet (permission skipped or save failed)
      const cachePath = `qb-${Date.now()}.pdf`;

      // Write without encoding
      await Filesystem.writeFile({
        path: cachePath,
        data: base64Only,
        directory: Directory.Cache,
      });

      const uriResult = await Filesystem.getUri({
        path: cachePath,
        directory: Directory.Cache,
      });

      await Share.share({
        title: paper.title || paper.shortName,
        url: uriResult.uri,
        dialogTitle: 'PDF সেভ/শেয়ার',
      });
    } else {
      // Direct browser download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } finally {
    // Clean up measurement root
    if (hiddenRoot && hiddenRoot.parentNode) {
      hiddenRoot.parentNode.removeChild(hiddenRoot);
    }
  }
}

/**
 * Convenient helper to load all paper questions, stimuli, and images by paperId,
 * and execute the PDF generation process
 */
export async function exportPaperById(paperId: string): Promise<string | undefined> {
  const paper = await db.papers.get(paperId);
  if (!paper) {
    throw new Error('প্রশ্নপত্রটি ডাটাবেসে পাওয়া যায়নি।');
  }

  const questionsList = await db.questions
    .where('id')
    .anyOf(paper.questionIds || [])
    .toArray();

  questionsList.sort((a, b) => {
    const idxA = paper.questionIds.indexOf(a.id);
    const idxB = paper.questionIds.indexOf(b.id);
    return idxA - idxB;
  });

  const stimulusIds = Array.from(
    new Set(questionsList.map((q) => q.stimulusId).filter(Boolean))
  ) as string[];

  const stimuliMap = new Map<string, Stimulus>();
  if (stimulusIds.length > 0) {
    const stims = await db.stimuli.where('id').anyOf(stimulusIds).toArray();
    stims.forEach((s) => stimuliMap.set(s.id, s));
  }

  const groups: Array<{ stimulus?: Stimulus; questions: Question[] }> = [];
  const stimGroupMap = new Map<string, Question[]>();
  const noStimQuestions: Question[] = [];

  for (const q of questionsList) {
    if (q.stimulusId && stimuliMap.has(q.stimulusId)) {
      const arr = stimGroupMap.get(q.stimulusId) || [];
      arr.push(q);
      stimGroupMap.set(q.stimulusId, arr);
    } else {
      noStimQuestions.push(q);
    }
  }

  stimGroupMap.forEach((qList, stimId) => {
    groups.push({
      stimulus: stimuliMap.get(stimId),
      questions: qList,
    });
  });

  for (const q of noStimQuestions) {
    groups.push({ questions: [q] });
  }

  // Fetch Images Blob URLs
  const urls: Record<string, string> = {};
  for (const g of groups) {
    if (g.stimulus?.imageIds) {
      for (const imgId of g.stimulus.imageIds) {
        const url = await getImageBlobUrl(imgId);
        if (url) urls[imgId] = url;
      }
    }
    for (const q of g.questions) {
      if (q.solutionImageIds) {
        for (const imgId of q.solutionImageIds) {
          const url = await getImageBlobUrl(imgId);
          if (url) urls[imgId] = url;
        }
      }
    }
  }

  return await generateAndSharePdf({
    paper,
    groupedQuestions: groups,
    imageUrls: urls,
  });
}
