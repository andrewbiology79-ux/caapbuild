import { db, type Category, type Paper } from '../db/db';
import { makeDir, readText, scanTree, statPath, writeTextSafe, removeFile, renamePath, pathExists } from './nativeStore';
import {
  CATEGORY_ROOT, categoryDirNameFor, categoryMetaPath, categoryMetaToText,
  emptyCategorySyncState, normalizeCategorySyncState, paperFileNameFor,
  paperToText, parsePaperFile, sanitizeFolderName, categoryUnnecessaryPath,
  type CategorySyncState,
} from './categoryLayout';
import { buildCategoryNodes } from './categoryCompare';
import { isReservedDirName } from './folderLayout';
import { withSyncLock } from './syncLock';

const META_KEY = 'categorySyncState';
let installed = false;
let enabled = false;
let scheduled = false;

async function getState(): Promise<CategorySyncState> {
  const row = await db.meta.get(META_KEY);
  return normalizeCategorySyncState(row?.value ?? emptyCategorySyncState());
}
async function putState(state: CategorySyncState): Promise<void> {
  await db.meta.put({ key: META_KEY, value: state });
}
function schedule(): void {
  if (!enabled || scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    void withSyncLock(() => flushCategoryWrites()).catch((e) => console.warn('Category folder sync failed:', e));
  }, 850);
}

/** Category and paper changes are queued separately from Question_Bank's subject/chapter/topic tables. */
export function installCategoryWriteHooks(): void {
  if (installed) return;
  installed = true;
  const onChange = (id: string, tx: any) => {
    if (!enabled || tx?.qbSync === true) return;
    void id; schedule();
  };
  db.categories.hook('creating', function (_pk: any, obj: any, tx: any) { onChange(obj.id, tx); });
  db.categories.hook('updating', function (_mods: any, pk: any, _obj: any, tx: any) { onChange(pk, tx); });
  db.categories.hook('deleting', function (pk: any, _obj: any, tx: any) {
    if (!enabled || tx?.qbSync === true) return;
    schedule();
  });
  db.papers.hook('creating', function (_pk: any, obj: any, tx: any) { onChange(obj.categoryId || obj.id, tx); });
  db.papers.hook('updating', function (_mods: any, _pk: any, _obj: any, tx: any) { onChange('all', tx); });
  db.papers.hook('deleting', function (_pk: any, _obj: any, tx: any) { onChange('all', tx); });
}

export function setCategoryWritesEnabled(on: boolean): void { enabled = on; }

async function writeIfChanged(path: string, text: string): Promise<void> {
  if ((await readText(path)) === text) return;
  await writeTextSafe(path, text);
}

/** App -> Download/QB Collection/Category. Keeps IDs in .folder.json and in each paper JSON. */
export async function flushCategoryWrites(): Promise<void> {
  if (!enabled) return;
  await makeDir(CATEGORY_ROOT);
  const [categories, papers, state] = await Promise.all([db.categories.toArray(), db.papers.toArray(), getState()]);
  const taken = new Set<string>();
  const next = normalizeCategorySyncState(state);
  const categoryIds = new Set(categories.map((c) => c.id));
  // App-deleted categories are moved aside (not destroyed), so the next scan cannot resurrect them.
  for (const [id, old] of Object.entries(state.categories)) {
    if (categoryIds.has(id)) continue;
    const oldPath = `${CATEGORY_ROOT}/${old.dirName}`;
    if (await pathExists(oldPath)) {
      await makeDir(`${CATEGORY_ROOT}/unnecessary`);
      const safeName = `deleted_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      let targetName = safeName;
      let target = categoryUnnecessaryPath('', targetName);
      let suffix = 2;
      while (await pathExists(target)) { targetName = `${safeName}_${suffix++}`; target = categoryUnnecessaryPath('', targetName); }
      await renamePath(oldPath, target);
    }
    delete next.categories[id];
    for (const [paperId, row] of Object.entries(next.papers)) if (row.categoryId === id) delete next.papers[paperId];
  }
  const paperIds = new Set(papers.map((p) => p.id));
  // Remove only paper files previously tracked by this sync, never unknown user files.
  for (const [id, row] of Object.entries(state.papers)) {
    if (paperIds.has(id)) continue;
    const oldDir = state.categories[row.categoryId]?.dirName;
    if (oldDir) await removeFile(`${CATEGORY_ROOT}/${oldDir}/${row.fileName}`);
    delete next.papers[id];
  }
  for (const cat of [...categories].sort((a, b) => a.order - b.order)) {
    const previousDir = next.categories[cat.id]?.dirName;
    let dirName = previousDir;
    const wanted = sanitizeFolderName(cat.name);
    if (!dirName || isReservedDirName(dirName) || (dirName !== wanted && !taken.has(wanted.toLowerCase()))) {
      let candidate = categoryDirNameFor(cat.name, taken);
      let suffix = 2;
      while (await pathExists(`${CATEGORY_ROOT}/${candidate}`) && candidate !== dirName) {
        candidate = `${sanitizeFolderName(cat.name)} (${suffix++})`;
      }
      if (dirName && dirName !== candidate && await pathExists(`${CATEGORY_ROOT}/${dirName}`) && !(await pathExists(`${CATEGORY_ROOT}/${candidate}`))) {
        await renamePath(`${CATEGORY_ROOT}/${dirName}`, `${CATEGORY_ROOT}/${candidate}`);
      }
      dirName = candidate;
    }
    if (taken.has(dirName.toLowerCase())) dirName = categoryDirNameFor(cat.name, taken);
    taken.add(dirName.toLowerCase());
    await makeDir(`${CATEGORY_ROOT}/${dirName}`);
    await writeIfChanged(categoryMetaPath(dirName), categoryMetaToText(cat));
    next.categories[cat.id] = { dirName };
    const categoryPapers = papers.filter((p) => p.categoryId === cat.id)
      .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.createdAt - b.createdAt);
    const used = new Set<string>();
    for (const paper of categoryPapers) {
      const previous = next.papers[paper.id];
      if (previous && previous.categoryId !== cat.id) {
        const previousDir = next.categories[previous.categoryId]?.dirName;
        if (previousDir) await removeFile(`${CATEGORY_ROOT}/${previousDir}/${previous.fileName}`);
      }
      let fileName = previous?.categoryId === cat.id ? previous.fileName : undefined;
      if (!fileName || used.has(fileName.toLowerCase())) fileName = paperFileNameFor(paper.shortName, used);
      used.add(fileName.toLowerCase());
      const path = `${CATEGORY_ROOT}/${dirName}/${fileName}`;
      await writeIfChanged(path, paperToText(paper));
      const st = await statPath(path);
      next.papers[paper.id] = { categoryId: cat.id, fileName, mtime: st?.mtime ?? 0, size: st?.size ?? 0 };
    }
  }
  // Keep deleted IDs in the state until a later scan; never recursively delete user files here.
  await putState(next);
}

/** Folder -> app. Only valid category metadata and valid paper JSON are imported; unknown files are left untouched. */
export async function scanCategories(): Promise<{ added: number; updated: number; warnings: string[]; changed: boolean }> {
  const warnings: string[] = [];
  await makeDir(CATEGORY_ROOT);
  const listing = await scanTree(CATEGORY_ROOT);
  const built = buildCategoryNodes(listing.entries);
  const state = await getState();
  let added = 0, updated = 0, changed = false;
  const categories = await db.categories.toArray();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const byDir = new Map<string, Category>();
  for (const cat of categories) {
    const dir = state.categories[cat.id]?.dirName;
    if (dir) byDir.set(dir.toLowerCase(), cat);
  }
  const next = normalizeCategorySyncState(state);
  const seenCategoryIds = new Set<string>();
  const seenPaperIds = new Set<string>();
  for (const node of built.nodes) {
    let cat = node.meta ? byId.get(node.meta.id) : undefined;
    if (!cat) cat = byDir.get(node.dirName.toLowerCase()) ?? categories.find((c) => c.name.toLowerCase() === node.dirName.toLowerCase());
    if (!cat) {
      const id = node.meta?.id || `cat_folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      cat = { id, name: node.meta?.name || node.dirName, order: Math.max(0, ...categories.map((c) => c.order)) + 1, createdAt: Date.now() };
      categories.push(cat); byId.set(cat.id, cat); added++; changed = true;
      await db.categories.put(cat);
    } else if (state.categories[cat.id]?.dirName && state.categories[cat.id].dirName !== node.dirName) {
      // A renamed folder is treated as a category rename; the app-generated metadata is refreshed below.
      cat = { ...cat, name: node.dirName };
      await db.categories.put(cat); byId.set(cat.id, cat); updated++; changed = true;
    }
    if (seenCategoryIds.has(cat.id)) { warnings.push(`একই Category ID-র একাধিক ফোল্ডার পাওয়া গেছে: ${node.dirName} (এটি এড়ানো হয়েছে)`); continue; }
    seenCategoryIds.add(cat.id);
    next.categories[cat.id] = { dirName: node.dirName };
    for (const file of node.files) {
      const text = await readText(`${CATEGORY_ROOT}/${node.dirName}/${file.fileName}`);
      const parsed = parsePaperFile(text, file.mtime);
      if (!parsed.ok) { warnings.push(`${node.dirName}/${file.fileName}: ${parsed.reason}`); continue; }
      const incoming = parsed.paper;
      if (seenPaperIds.has(incoming.id)) { warnings.push(`একই প্রশ্নপত্র ID একাধিক ফাইলে আছে: ${incoming.shortName} (পরের কপি এড়ানো হয়েছে)`); continue; }
      seenPaperIds.add(incoming.id);
      const existing = await db.papers.get(incoming.id);
      const full: Paper = { ...incoming, category: cat.name, categoryId: cat.id };
      if (!existing || JSON.stringify(existing) !== JSON.stringify(full)) {
        await db.papers.put(full); updated++; changed = true;
      }
      next.papers[incoming.id] = { categoryId: cat.id, fileName: file.fileName, mtime: file.mtime, size: file.size };
    }
  }
  await putState(next);
  return { added, updated, warnings, changed };
}
