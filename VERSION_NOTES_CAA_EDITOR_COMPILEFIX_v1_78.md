# Version notes — QuestionBank v1.78 compile fix

Base: v1.77 CAA Editor correction

## Fixed
- CI run 66 failed with `QuestionEditViewModel.kt:230:22 Unresolved reference 'defaultEditorMode'`.
- `defaultEditorMode` is now `private val` in `QuestionEditViewModel` and `QuestionEditorViewModel` so it is usable inside `restoreDraft()` / draft-restore code, not only in initializers.

## Preserved
- No behaviour, schema, dependency or version (versionCode 36) change. Call sites unchanged.

## Verification
- Not compiled in this environment. Re-run CI to confirm; further errors may surface once this one is cleared.
