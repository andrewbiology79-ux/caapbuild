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
  (`StorageAccessPlugin.watch`) reports a change, and from the menu item "ফোল্ডার থেকে সিঙ্ক করুন".
- Deleting a folder in the file manager deletes the item in the app. Safety: a missing Question_Bank folder never deletes anything,
  and when more than half of the folders look gone the app asks first.
- First launch after the update: safety backup, then the database is written into the folders and verified (`enableFolderSync`).
- Lists show the text first; pictures are loaded afterwards from the media files (cached, 3 at a time).

## Version / build

`package.json` version + GitHub run number + build date are shown in Profile > অ্যাপ পরিচিতি. APK name: `QbCollectionExam-v<version>-build<run>.apk`.

Note: run `npm install` once locally and commit the new `package-lock.json` (the old one was out of sync); after that the workflow can use `npm ci`.
