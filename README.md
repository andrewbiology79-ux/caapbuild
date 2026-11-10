HSC QB

## Folder sync (Download/QB Collection/Question_Bank)

The question bank lives in the phone storage as plain folders; the app database (IndexedDB) is only a fast cache.

```
Download/QB Collection/
  Question_Bank/
    Type_CQ/<subject>/<chapter>/<type>/   data.json + media/
    Chapter_CQ/<subject>/<chapter>/       data.json + media/
  Backup/  PDF files  Images/             (outside Question_Bank, never scanned)
```

- Every subject / chapter / type folder has a hidden `.folder.json` (id, name, order) so a renamed or moved folder is still the same item.
- `data.json` holds the text and structure, `media/<id>.webp` the pictures (`media/.nomedia` keeps them out of the gallery).
- App -> folders: Dexie hooks (`src/storage/writer.ts`) queue every change, written ~0.8 s later.
- Folders -> app: `src/storage/scanner.ts` runs when the app opens, comes back to the front, when the native watcher
  (`StorageAccessPlugin.watch`) reports a change, and from the 3-dot menu (see below).
- Deleting a folder in the file manager deletes the item in the app. Safety: a missing Question_Bank folder never deletes anything,
  and when more than half of the folders look gone the app asks first.
- First launch after the update: safety backup, then the database is written into the folders and verified (`enableFolderSync`).
- Lists show the text first; pictures are loaded afterwards from the media files (cached, 3 at a time).

### Sync menu, preview and progress window

Every screen's 3-dot menu ends with two items (always shown; if sync is off or the app runs in a browser a toast explains why):

- **ফোল্ডার থেকে সিঙ্ক করুন** (folders -> app) and **অ্যাপ থেকে ফোল্ডারে সিঙ্ক করুন** (app -> folders).
- Tapping one first calculates a **preview** (nothing is written): what will be added / renamed / moved / deleted / updated, grouped by Type CQ / Chapter CQ > subject, deletions in red, and a separate orange **conflict** section.
- **[নিশ্চিত করুন]** starts the real sync in a full-screen window with a progress bar (done / total, current item, counters). While it runs there is no cancel button and Back does nothing. At the end it shows the result and **[ঠিক আছে]**; errors show the stage and whether data is safe.
- Automatic sync is **app -> folders only**: it writes the app's queued changes into the folders (after every edit, at app start and when the app comes back to the front). It never reads the folders into the app and there is no folder watcher any more - **folder -> app happens only from the 3-dot menu** ("ফোল্ডার থেকে সিঙ্ক করুন"). While it writes, a one-line text **"অটো সিঙ্ক হচ্ছে…"** shows right under the ribbon (blue header) of every screen, then "অটো সিঙ্ক শেষ" for ~2.5 s. Errors still come as a toast. It waits while a question / paper / paste form is open, and the 3-dot sync items say "অটো সিঙ্ক চলছে" while it runs. Code: `storage/autoSyncStatus.ts` (state) + `components/AutoSyncStrip.tsx` (the line, mounted inside `Header`), `autoWriteNow` in `syncEngine.ts`.
- **App -> folder is direct.** Every change in the app is written into the folders by the Dexie hooks, so there is no "both sides changed" / "data differs" conflict kind any more. When the app writes a type's `data.json`, the app's copy simply wins (the preview shows what the folder had extra in red before you confirm).
- **There is no conflict kind any more.** The old top-level `Download/QB Collection/Sync_Conflicts/` is no longer filled; copied folders go to `unnecessary/Sync_Conflicts/` inside their parent. A folder whose name an app item (same parent) already has comes into the app as "name (2)" (info line in the preview).
- **Extra (unnecessary) items are NOT conflicts.** A picture in `media/` that no question / stimulus of that type uses (it does not matter whether the picture still has a record in the app's image table - after a replaced picture or a deleted question the old file is unnecessary, e.g. 27 files in `media/` but only 21 pictures in the questions -> 6 go to `unnecessary/`), a **copied folder** (same id as another folder, e.g. "অধ্যায় ১ - Copy"; it goes to `unnecessary/Sync_Conflicts/<name>` of its parent), a stray file / folder inside a type (Type CQ) or chapter (Chapter CQ) folder, or an unknown folder is moved (never deleted) into an `unnecessary/` folder inside the folder it was found in, keeping its sub-path: `<type>/media/x.webp` -> `<type>/unnecessary/media/x.webp`. The preview shows them in their own grey section ("অপ্রয়োজনীয়"), grouped per folder. The scanner ignores every `unnecessary/` folder, a name clash gets "name (2)", and a `.nomedia` keeps the pictures out of the gallery. System files (`.folder.json`, `.nomedia`, `data.json.tmp/.bak`) are never extra. Pictures are only judged when the type has a readable `data.json` or the app already knows the type.
- Code: `syncCompare.ts` (pure compare rules), `syncPreview.ts` (preview), `syncController.ts` (menu -> preview -> run state machine), `syncRun.ts` (the real run), `syncConflictMove.ts` / `syncConflictPlan.ts` (moves both conflicts and extras), `syncProgress.ts`, `syncView.ts` + `components/SyncPreviewDialog.tsx` (window), `utils/useSyncMenuItems.tsx` (menu items).

## Version / build

`package.json` version + GitHub run number + build date are shown in Profile > অ্যাপ পরিচিতি. APK name: `QbCollectionExam-v<version>-build<run>.apk`.

Note: run `npm install` once locally and commit the new `package-lock.json` (the old one was out of sync); after that the workflow can use `npm ci`.

## Tests

`npm test` (vitest) runs the logic tests in `tests/` (filter engine, solution parts, paper edits, folder names, duplicate text matching, sync compare / progress / controller / conflict planning). GitHub Actions runs them before building the APK; a failing test stops the build.

## PDF test page

`test-data/pdf-test-collection.json` + `test-data/PDF_TEST_CHECKLIST.md`: a sample subject (formulas, pictures, very long solution, missing answers) to import and render after every PDF code change. Not part of the app.

## Image editor

After picking pictures (stimulus, solution, replace) a small editor offers rotate, crop and scan mode (grey / black-and-white). "এডিট ছাড়া রাখো" keeps the picture as before. It can be switched off in Settings. Logic: `src/utils/imageEdit.ts`, dialog: `src/components/ImageEditQueue.tsx`.
