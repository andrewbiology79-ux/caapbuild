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
- Automatic syncs (app start, app back to front, folder watcher) use the same window ("স্বয়ংক্রিয় সিঙ্ক"), always show a result (even "কিছু বদলায়নি") and wait while a question / paper / paste form is open. They never move conflicts, they only report them.
- **Conflicts are never deleted.** The losing copy is moved to `Download/QB Collection/Sync_Conflicts/<date-time>/<Type_CQ|Chapter_CQ>/<original path>`: copied folders (same id), extra folders / pictures that the app does not know, data that differs on both sides. If a move fails, only that item is skipped.
- Code: `syncCompare.ts` (pure compare rules), `syncPreview.ts` (preview), `syncController.ts` (menu -> preview -> run state machine), `syncRun.ts` (the real run), `syncConflictMove.ts` / `syncConflictPlan.ts`, `syncProgress.ts`, `syncView.ts` + `components/SyncPreviewDialog.tsx` (window), `utils/useSyncMenuItems.tsx` (menu items).

## Version / build

`package.json` version + GitHub run number + build date are shown in Profile > অ্যাপ পরিচিতি. APK name: `QbCollectionExam-v<version>-build<run>.apk`.

Note: run `npm install` once locally and commit the new `package-lock.json` (the old one was out of sync); after that the workflow can use `npm ci`.

## Tests

`npm test` (vitest) runs the logic tests in `tests/` (filter engine, solution parts, paper edits, folder names, duplicate text matching, sync compare / progress / controller / conflict planning). GitHub Actions runs them before building the APK; a failing test stops the build.

## PDF test page

`test-data/pdf-test-collection.json` + `test-data/PDF_TEST_CHECKLIST.md`: a sample subject (formulas, pictures, very long solution, missing answers) to import and render after every PDF code change. Not part of the app.

## Image editor

After picking pictures (stimulus, solution, replace) a small editor offers rotate, crop and scan mode (grey / black-and-white). "এডিট ছাড়া রাখো" keeps the picture as before. It can be switched off in Settings. Logic: `src/utils/imageEdit.ts`, dialog: `src/components/ImageEditQueue.tsx`.
