import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Question } from '../types';
import { toHtml, KATEX_CSS } from './latex';

const bn = (n: number) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[+d]);

export function buildExamHtml(qs: Question[], title: string): string {
  const body = qs.map((q, i) => {
    const subs = [q.gha, q.ghe].filter((s) => s.includeInCreate)
      .map((s) => `<p class="sub"><b>${s.label}.</b> ${toHtml(s.text)} <span class="mk">${bn(s.marks)}</span></p>`)
      .join('');
    const imgs = q.stimulus.images.map((im) => `<img src="${im.uri}"/>`).join('');
    return `<div class="q"><p><b>${bn(i + 1)}.</b> ${toHtml(q.stimulus.text)}</p>${imgs}${subs}</div>`;
  }).join('');

  return `<html><head><meta charset="utf-8"/><link rel="stylesheet" href="${KATEX_CSS}"/>
  <style>body{font-family:'Noto Sans Bengali',sans-serif;font-size:13px;line-height:1.7;padding:24px;color:#000}
  h1{text-align:center;font-size:18px;margin:0 0 16px}.q{margin-bottom:18px;page-break-inside:avoid}
  .sub{margin:4px 0 4px 18px}.mk{float:right}img{max-width:60%;display:block;margin:6px 0}</style></head>
  <body><h1>${title}</h1>${body}</body></html>`;
}

export async function exportQuestionPaper(qs: Question[], title = 'পদার্থবিজ্ঞান – সৃজনশীল প্রশ্ন') {
  const { uri } = await Print.printToFileAsync({ html: buildExamHtml(qs, title) });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  return uri;
}
