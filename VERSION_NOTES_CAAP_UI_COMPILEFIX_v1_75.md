# Version notes: v1.75 CAAP UI compile fix

Fixes CI run 64 (commit bd3f9fd) failure of v1.74 at `:app:compileDebugKotlin`.

- `QuestionCard.kt`: added missing `androidx.compose.foundation.layout.height` import.
- `QuestionListScreen.kt`: add-question `ExtendedFloatingActionButton` rewritten to the content-lambda overload (`Row` content: "+" , spacer, "Add question"); added `Spacer` import.

Status: NOT compiled or tested locally. Next step: push and run CI.
