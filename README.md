# Physics CQ App

Creative-question (CQ) bank and exam-paper builder. Expo + React Native + TypeScript.

## Run
```
npm install
npx expo start
```
Then scan the QR code with Expo Go. `npm run typecheck` runs the TypeScript check.

## Features
- 4 tabs: Cq Create, Category, CQ Collection, More
- Folder tree (Subject > Paper > Chapter > Topic): add, rename, delete (long-press a folder)
- CQ cards: SL no, +/x select, usage log, difficulty stars, Copy/Cut/Paste Before/After, Edit, Delete, images
- Auto LaTeX for text inside [ ... ] (KaTeX)
- Answer editor with math toolbar, preview and images
- CQ Create: count, drag reorder, PDF export (logs usage on export)
- Data saved on device; JSON backup export / import in More

## Structure
```
App.tsx
src/types.ts
src/navigation/Tabs.tsx
src/screens/      CqCreate, Category, Collection, More
src/components/   CqItemCard, MathText, QuestionEditorModal, AnswerEditorModal, TextPrompt
src/store/        useCqStore.ts (persisted zustand)
src/utils/        latex.ts, exportPdf.ts
src/data/seed.ts  sample data
```

## Known limits
- Images are stored as file paths, so they are not included in the JSON backup.
- KaTeX styles load from a CDN, so equations need internet.
- PDF export lists questions only; an answer-key PDF is not built yet.

## Build the APK on GitHub (no commands needed)
Push the code to GitHub. The "Build APK" workflow runs automatically on every push to `main`
(or open Actions > Build APK > Run workflow). When it finishes (about 15-25 minutes), open the run
and download `physics-cq-apk` from the Artifacts section at the bottom. Unzip it and install
`app-release.apk` on an Android phone (allow "install unknown apps").

The APK is signed with the default debug key, which is fine for testing and sharing but not for the Play Store.
