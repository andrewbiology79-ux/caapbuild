import { getDb, type CqScope, type QbDatabase, type Stimulus, type Question, type SyncRow } from '../db/db';
import { scopeRoot, FOLDER_META, DATA_FILE, imageIdFromFileName, type FolderKind, type FolderMeta } from './folderLayout';
import {
  buildNodes,
  identifyNodes,
  findDeletedRows,
  needsDataRead,
  newId,
  normStimulus,
  normQuestion,
  type FolderNode as Node,
} from './syncCompare';
import { scanTree, readText, writeText, makeDir } from './nativeStore';
import { markSyncTx, markTopicDirty, markEntityDirty, forgetWritten } from './writer';

/**
 * Folders -> app.
 *
 * The folder tree is the real data. This reads it (one native call), compares it with what the app
 * knows (syncState) and brings the app database in line:
 *   - new folder              -> new subject / chapter / type
 *   - folder renamed / moved  -> item renamed / moved (recognised by the id in ".folder.json")
 *   - folder deleted          -> item deleted (with everything inside it)
 *   - data.json changed       -> questions / stimuli of that type updated
 *   - media/ files            -> picture index updated
 * Pending app changes are always written into the folders BEFORE a scan (see syncEngine.ts), so every
 * difference found here really comes from outside the app.
 */

export interface ScanSummary {
  scope: CqScope;
  added: number;
  renamed: number;
  deleted: number;
  topicsUpdated: number;
  warnings: string[];
  /** something in the app database changed */
  changed: boolean;
  /** the scan could not run (folder not readable ...) - nothing was changed */
  error?: string;
}

export interface ScanOptions {
  /** called when more than half of the items look deleted - return true to really delete them */
  confirmMassDelete?: (count: number, total: number) => boolean;
}

let declinedSignature = '';

interface TopicPlan {
  node: Node;
  topicId: string;
  chapterId: string;
  isNewTopic: boolean;
  /** parsed data.json (only when it has to be applied) */
  payload?: { stimuli: any[]; questions: any[]; images: any[] };
  remap: boolean;
  mtime: number;
  size: number;
  warning?: string;
}

export async function scanScope(scope: CqScope, opts: ScanOptions = {}): Promise<ScanSummary> {
  const sdb = getDb(scope);
  const root = scopeRoot(scope);
  const summary: ScanSummary = { scope, added: 0, renamed: 0, deleted: 0, topicsUpdated: 0, warnings: [], changed: false };

  let listing;
  try {
    listing = await scanTree(root);
  } catch (err: any) {
    summary.error = err?.message || 'ফোল্ডার পড়া যায়নি';
    return summary;
  }

  const rowCount = await sdb.syncState.where('kind').anyOf('subject', 'chapter', 'topic').count();
  if (!listing.exists) {
    if (rowCount > 0) {
      summary.error = 'Question_Bank ফোল্ডার পাওয়া যায়নি (কিছু মোছা হয়নি)';
      return summary;
    }
    await makeDir(root);
    return summary;
  }

  const nodes = buildNodes(scope, listing.entries);

  // ---- snapshot of the app database ----
  const [subjects, chapters, topics, rows] = await Promise.all([
    sdb.subjects.toArray(),
    sdb.chapters.toArray(),
    sdb.topics.toArray(),
    sdb.syncState.toArray(),
  ]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const rowById = new Map<string, SyncRow>(rows.map((r) => [r.id, r]));

  const orderMax = new Map<string, number>(); // parent id -> highest order in use
  const bump = (key: string, order: number) => orderMax.set(key, Math.max(orderMax.get(key) ?? 0, order || 0));
  subjects.forEach((s) => bump('', s.order));
  chapters.forEach((c) => bump(c.subjectId, c.order));
  topics.forEach((t) => bump(t.chapterId, t.order));

  // ---- identify folders (id from .folder.json; copied folders become NEW items) - rules live in syncCompare.ts ----
  const { dupNodes, diskIds } = identifyNodes(nodes, rowById, orderMax);

  // ধাপ ৫ (Q1): কপি করা ফোল্ডার (একই id) নতুন আইটেম হয়ে ঢোকে না - ভেতরের সবকিছুসহ বাদ। মেনুর সিঙ্কে ওগুলো
  // আগেই Sync_Conflicts-এ সরে যায়; অটো সিঙ্ক নিজে সরায় না, শুধু জানায়।
  if (dupNodes.size > 0) {
    const inDup = (n: Node) => {
      for (let p: Node | undefined = n; p; p = p.parent) if (dupNodes.has(p)) return true;
      return false;
    };
    for (let i = nodes.length - 1; i >= 0; i--) if (inDup(nodes[i])) nodes.splice(i, 1);
    summary.warnings.push(`${dupNodes.size}টি কপি করা ফোল্ডার পাওয়া গেছে (অ্যাপে ঢোকানো হয়নি) - মেনু থেকে সিঙ্ক করে সমাধান করুন`);
  }

  // ---- deleted folders ----
  const found = findDeletedRows(rows, diskIds);
  let deletedRows = found.deleted;
  if (deletedRows.length > 0) {
    const sig = deletedRows.map((r) => r.id).sort().join(',');
    const massive = found.massive;
    if (massive) {
      if (sig === declinedSignature) {
        deletedRows = [];
      } else {
        const ok = opts.confirmMassDelete ? opts.confirmMassDelete(deletedRows.length, found.total) : false;
        if (!ok) {
          declinedSignature = sig;
          summary.warnings.push('অনেকগুলো ফোল্ডার পাওয়া যাচ্ছে না - কিছু মোছা হয়নি');
          deletedRows = [];
        }
      }
    }
  }

  // ---- write ".folder.json" for new / copied folders (file IO must happen before the database transaction) ----
  for (const n of nodes) {
    if (!n.isNew) continue;
    const meta: FolderMeta = { id: n.id as string, kind: n.kind, name: n.name, order: n.order ?? 0 };
    try {
      await writeText(`${root}/${n.path}/${FOLDER_META}`, JSON.stringify(meta));
    } catch (err) {
      console.warn('Could not write folder info:', err);
    }
  }

  // ---- data.json of every type / chapter folder ----
  const dataDepth = scope === 'type' ? 3 : 2;
  const plans: TopicPlan[] = [];
  for (const n of nodes) {
    if (n.depth !== dataDepth) continue;
    const id = n.id as string;
    const chapterNode = scope === 'type' ? n.parent : n;
    const chapterId = chapterNode?.id as string;
    if (!chapterId) continue;

    let topicId: string;
    let isNewTopic = false;
    if (scope === 'type') {
      topicId = id;
      isNewTopic = !topicById.has(id);
    } else {
      const existing = topics.filter((t) => t.chapterId === chapterId).sort((a, b) => a.order - b.order)[0];
      topicId = existing?.id ?? '';
      isNewTopic = !existing;
    }

    const dataRow = topicId ? rowById.get(`data:${topicId}`) : undefined;
    const isDup = dupNodes.has(n);
    const needRead = needsDataRead(n, isDup, dataRow);

    if (!n.hasData) {
      // no data.json yet (new folder) or it was deleted -> it is written again from the app's copy
      if (topicId) plans.push({ node: n, topicId, chapterId, isNewTopic, remap: false, mtime: 0, size: 0 });
      continue;
    }
    if (!needRead) continue;

    const plan: TopicPlan = { node: n, topicId, chapterId, isNewTopic, remap: isDup, mtime: n.dataMtime, size: n.dataSize };
    const text = await readText(`${root}/${n.path}/${DATA_FILE}`);
    let parsed: any = null;
    if (text !== null) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      plan.warning = `${n.path}/${DATA_FILE} পড়া যায়নি (ফাইলে ভুল আছে) - আগের তথ্য রাখা হয়েছে`;
      plans.push(plan); // still remembered, so the warning is not repeated until the file changes
      continue;
    }
    plan.payload = {
      stimuli: Array.isArray(parsed.stimuli) ? parsed.stimuli : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      images: Array.isArray(parsed.images) ? parsed.images : [],
    };
    if (scope === 'chapter' && !topicId) {
      const wanted = typeof parsed?.topic?.id === 'string' ? parsed.topic.id : '';
      topicId = wanted && !topicById.has(wanted) && !isDup ? wanted : newId();
      plan.topicId = topicId;
      plan.isNewTopic = true;
    }
    plans.push(plan);
  }

  // ---- apply everything to the app database (no file IO inside this transaction) ----
  const missingData: string[] = [];
  const entityOrphans: Array<{ kind: FolderKind; id: string }> = [];
  const deletedQuestionCount = { n: 0 };

  await sdb.transaction(
    'rw',
    [sdb.subjects, sdb.chapters, sdb.topics, sdb.stimuli, sdb.questions, sdb.images, sdb.syncState],
    async (tx) => {
      markSyncTx(tx);

      // 1) deletions
      for (const r of deletedRows) {
        const kind = r.kind as FolderKind;
        const gone = await cascadeDelete(sdb, scope, kind, r.id, deletedQuestionCount);
        if (gone) summary.deleted++;
      }

      // 2) folders -> subjects / chapters / types
      for (const n of nodes) {
        const id = n.id as string;
        const dirName = n.name;
        const parentId = n.parent?.id as string | undefined;

        if (n.kind === 'subject') {
          const ent = subjectById.get(id);
          if (!ent) {
            if (rowById.has(id) && !n.isNew) continue; // deleted inside the app a moment ago
            await sdb.subjects.put({ id, name: dirName, order: n.order ?? 1 });
            await sdb.syncState.put({ id, kind: 'subject', dirName });
            summary.added++;
          } else {
            const row = rowById.get(id);
            const patch: any = {};
            if (row && row.dirName !== dirName) patch.name = dirName;
            if (n.order !== undefined && n.order !== ent.order) patch.order = n.order;
            if (Object.keys(patch).length) {
              await sdb.subjects.update(id, patch);
              if (patch.name) summary.renamed++;
            }
            if (!row || row.dirName !== dirName) await sdb.syncState.put({ id, kind: 'subject', dirName });
          }
        } else if (n.kind === 'chapter') {
          if (!parentId) continue;
          const ent = chapterById.get(id);
          if (!ent) {
            if (rowById.has(id) && !n.isNew) continue;
            await sdb.chapters.put({ id, subjectId: parentId, name: dirName, order: n.order ?? 1 });
            await sdb.syncState.put({ id, kind: 'chapter', parentId, dirName });
            summary.added++;
          } else {
            const row = rowById.get(id);
            const patch: any = {};
            if (row && row.dirName !== dirName) patch.name = dirName;
            if (ent.subjectId !== parentId) patch.subjectId = parentId;
            if (n.order !== undefined && n.order !== ent.order) patch.order = n.order;
            if (Object.keys(patch).length) {
              await sdb.chapters.update(id, patch);
              if (patch.name || patch.subjectId) summary.renamed++;
            }
            if (!row || row.dirName !== dirName || row.parentId !== parentId) {
              await sdb.syncState.put({ id, kind: 'chapter', parentId, dirName });
            }
          }
        } else if (n.kind === 'topic') {
          if (!parentId) continue;
          const ent = topicById.get(id);
          if (!ent) {
            if (rowById.has(id) && !n.isNew) continue;
            await sdb.topics.put({ id, chapterId: parentId, name: dirName, order: n.order ?? 1 });
            await sdb.syncState.put({ id, kind: 'topic', parentId, dirName });
            summary.added++;
          } else {
            const row = rowById.get(id);
            const patch: any = {};
            if (row && row.dirName !== dirName) patch.name = dirName;
            if (ent.chapterId !== parentId) patch.chapterId = parentId;
            if (n.order !== undefined && n.order !== ent.order) patch.order = n.order;
            if (Object.keys(patch).length) {
              await sdb.topics.update(id, patch);
              if (patch.name || patch.chapterId) summary.renamed++;
            }
            if (!row || row.dirName !== dirName || row.parentId !== parentId) {
              await sdb.syncState.put({ id, kind: 'topic', parentId, dirName });
            }
          }
        }
      }

      // 3) data.json -> questions / stimuli, media/ -> picture index
      for (const plan of plans) {
        const { node, chapterId } = plan;
        const topicId = plan.topicId;
        if (!topicId) continue;

        if (plan.isNewTopic && !(await sdb.topics.get(topicId))) {
          const siblings = await sdb.topics.where('chapterId').equals(chapterId).toArray();
          await sdb.topics.put({
            id: topicId,
            chapterId,
            name: scope === 'chapter' ? 'সকল প্রশ্ন' : node.name,
            order: siblings.reduce((m, t) => Math.max(m, t.order || 0), 0) + 1,
          });
          if (scope === 'chapter') await sdb.syncState.put({ id: topicId, kind: 'topic', parentId: chapterId, dirName: '' });
        }

        if (plan.warning) {
          summary.warnings.push(plan.warning);
          await sdb.syncState.put({ id: `data:${topicId}`, kind: 'data', mtime: plan.mtime, size: plan.size });
          continue;
        }
        if (!plan.payload) {
          if (!node.hasData) missingData.push(topicId);
          continue;
        }

        // questions & stimuli
        const stimIdMap = new Map<string, string>();
        const stimuli: Stimulus[] = [];
        for (const s of plan.payload.stimuli) {
          if (!s || typeof s.id !== 'string') continue;
          const id = plan.remap ? newId() : s.id;
          stimIdMap.set(s.id, id);
          stimuli.push(normStimulus(s, topicId, id));
        }
        const questions: Question[] = [];
        plan.payload.questions.forEach((q: any, i: number) => {
          if (!q || typeof q.id !== 'string') return;
          const id = plan.remap ? newId() : q.id;
          const stimulusId = q.stimulusId ? stimIdMap.get(q.stimulusId) ?? q.stimulusId : undefined;
          questions.push(normQuestion(q, i, topicId, id, stimulusId));
        });

        const oldQ = await sdb.questions.where('topicId').equals(topicId).primaryKeys();
        const oldS = await sdb.stimuli.where('topicId').equals(topicId).primaryKeys();
        const newQIds = new Set(questions.map((q) => q.id));
        const newSIds = new Set(stimuli.map((s) => s.id));
        const dropQ = (oldQ as string[]).filter((id) => !newQIds.has(id));
        const dropS = (oldS as string[]).filter((id) => !newSIds.has(id));
        if (dropQ.length) await sdb.questions.bulkDelete(dropQ);
        if (dropS.length) await sdb.stimuli.bulkDelete(dropS);
        deletedQuestionCount.n += dropQ.length;
        if (stimuli.length) await sdb.stimuli.bulkPut(stimuli);
        if (questions.length) await sdb.questions.bulkPut(questions);

        // pictures: sizes from data.json + every file found in media/
        const metaImages = new Map<string, any>();
        for (const im of plan.payload.images) if (im && typeof im.id === 'string') metaImages.set(im.id, im);
        const fileIds = node.mediaFiles.map((f) => ({ file: f, id: imageIdFromFileName(f) as string }));
        const allIds = Array.from(new Set([...metaImages.keys(), ...fileIds.map((x) => x.id)]));
        const have = await sdb.images.bulkGet(allIds);
        const puts: any[] = [];
        for (let i = 0; i < allIds.length; i++) {
          const id = allIds[i];
          const rec = have[i];
          const meta = metaImages.get(id);
          const file = fileIds.find((x) => x.id === id)?.file;
          if (!file && !rec) continue; // listed in data.json but the file is missing
          if (!rec) {
            puts.push({ id, fileName: meta?.fileName || file || `${id}.webp`, topicId, w: meta?.w, h: meta?.h });
            continue;
          }
          if (rec.blob) continue;
          const holder = rec.topicId ? await sdb.topics.get(rec.topicId) : null;
          if (!holder) puts.push({ ...rec, topicId });
          else if (rec.topicId === topicId && meta?.w && (rec.w !== meta.w || rec.h !== meta.h)) puts.push({ ...rec, w: meta.w, h: meta.h });
        }
        if (puts.length) await sdb.images.bulkPut(puts);

        await sdb.syncState.put({ id: `data:${topicId}`, kind: 'data', mtime: plan.mtime, size: plan.size });
        summary.topicsUpdated++;
      }

      // 4) items the app has but that never got a folder (heal)
      const nowRows = new Set((await sdb.syncState.toArray()).map((r) => r.id));
      for (const s of await sdb.subjects.toArray()) if (!nowRows.has(s.id)) entityOrphans.push({ kind: 'subject', id: s.id });
      for (const c of await sdb.chapters.toArray()) if (!nowRows.has(c.id)) entityOrphans.push({ kind: 'chapter', id: c.id });
      for (const t of await sdb.topics.toArray()) if (!nowRows.has(t.id)) entityOrphans.push({ kind: 'topic', id: t.id });
    }
  );

  // ---- follow-up work (file IO again) ----
  for (const topicId of missingData) {
    if (!topicId) continue;
    forgetWritten(topicId);
    markTopicDirty(scope, topicId); // data.json is (re)written from the app's copy
  }
  for (const plan of plans) {
    if (plan.topicId && plan.payload) forgetWritten(plan.topicId);
    if (plan.topicId && plan.isNewTopic && scope === 'type') markTopicDirty(scope, plan.topicId);
  }
  for (const o of entityOrphans) markEntityDirty(scope, o.kind, o.id);

  if (summary.deleted > 0 || deletedQuestionCount.n > 0) await pruneSelection(sdb);

  summary.changed = summary.added + summary.renamed + summary.deleted + summary.topicsUpdated > 0;
  return summary;
}

/** Delete an item and everything below it (used when its folder was deleted outside the app) */
async function cascadeDelete(
  sdb: QbDatabase,
  scope: CqScope,
  kind: FolderKind,
  id: string,
  counter: { n: number }
): Promise<boolean> {
  let found = false;
  if (kind === 'subject') {
    const chapters = await sdb.chapters.where('subjectId').equals(id).toArray();
    for (const c of chapters) await cascadeDelete(sdb, scope, 'chapter', c.id, counter);
    found = !!(await sdb.subjects.get(id));
    await sdb.subjects.delete(id);
  } else if (kind === 'chapter') {
    const topics = await sdb.topics.where('chapterId').equals(id).toArray();
    for (const t of topics) await cascadeDelete(sdb, scope, 'topic', t.id, counter);
    found = !!(await sdb.chapters.get(id));
    await sdb.chapters.delete(id);
  } else {
    const qIds = await sdb.questions.where('topicId').equals(id).primaryKeys();
    counter.n += qIds.length;
    await sdb.questions.bulkDelete(qIds as string[]);
    const sIds = await sdb.stimuli.where('topicId').equals(id).primaryKeys();
    await sdb.stimuli.bulkDelete(sIds as string[]);
    await sdb.images.where('topicId').equals(id).delete();
    found = !!(await sdb.topics.get(id));
    await sdb.topics.delete(id);
  }
  await sdb.syncState.delete(id);
  await sdb.syncState.delete(`data:${id}`);
  return found;
}

/** Remove deleted questions from the "selected questions" list */
async function pruneSelection(sdb: QbDatabase): Promise<void> {
  try {
    const rec = await sdb.meta.get('selectedQuestionIds');
    const ids: string[] = Array.isArray(rec?.value) ? rec!.value : [];
    if (ids.length === 0) return;
    const found = await sdb.questions.bulkGet(ids);
    const keep = ids.filter((_, i) => !!found[i]);
    if (keep.length !== ids.length) await sdb.meta.put({ key: 'selectedQuestionIds', value: keep });
  } catch (err) {
    console.warn('Selection cleanup failed:', err);
  }
}
