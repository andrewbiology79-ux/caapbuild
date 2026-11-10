import { describe, it, expect } from 'vitest';
import { acquireEditor, editorsOpenCount, waitForEditorsClosed } from '../src/storage/editorGuard';

describe('editorGuard', () => {
  it('খোলা/বন্ধ গোনা; একই release দুবার ডাকলে দুবার কমে না', () => {
    const a = acquireEditor();
    const b = acquireEditor();
    expect(editorsOpenCount()).toBe(2);
    a();
    a();
    expect(editorsOpenCount()).toBe(1);
    b();
    expect(editorsOpenCount()).toBe(0);
  });
  it('এডিটর বন্ধ হলে অপেক্ষা শেষ (true); কিছু খোলা না থাকলে সঙ্গে সঙ্গে', async () => {
    expect(await waitForEditorsClosed(() => false, 1)).toBe(true);
    const r = acquireEditor();
    let polls = 0;
    const ok = await waitForEditorsClosed(() => false, 1, async () => {
      if (++polls === 3) r();
    });
    expect(ok).toBe(true);
    expect(polls).toBe(3);
  });
  it('থামাতে বললে অপেক্ষা false ফেরে, এডিটর খোলা থাকলেও', async () => {
    const r = acquireEditor();
    expect(await waitForEditorsClosed(() => true, 1, async () => {})).toBe(false);
    r();
  });
});
