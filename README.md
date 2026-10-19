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

## Build with GitHub Actions
`.github/workflows/build.yml` type-checks the code, then builds an Android APK on every push to `main` (or run it by hand from the Actions tab).

One-time setup:
1. `npm install -g eas-cli && eas login && eas init` (links the project and adds `extra.eas.projectId` to app.json; commit that change).
2. Create a token at expo.dev > Account settings > Access tokens.
3. In GitHub: Settings > Secrets and variables > Actions > New repository secret, name `EXPO_TOKEN`, paste the token.
4. Push to `main`. When the run finishes, download `physics-cq-apk` from the run's Artifacts section.

iOS builds need an Apple Developer account, so the workflow builds Android only.

## Build with GitHub Actions
Workflows live in `.github/workflows/`:
- `ci.yml` type-checks on every push and pull request.
- `build.yml` starts an Android APK (or iOS) build on Expo EAS.

One-time setup:
1. Create a free account at expo.dev, then run `npm i -g eas-cli`, `eas login`, `eas init` (this adds a project ID to `app.json`; commit it).
2. On expo.dev open Account settings > Access tokens and create a token.
3. In GitHub open Settings > Secrets and variables > Actions, add a secret named `EXPO_TOKEN` with that token.
4. Run the build: Actions tab > "Build app" > Run workflow, or push a tag: `git tag v0.1.0 && git push --tags`.

The finished APK download link appears on expo.dev under your project's Builds. iOS builds need an Apple Developer account.
