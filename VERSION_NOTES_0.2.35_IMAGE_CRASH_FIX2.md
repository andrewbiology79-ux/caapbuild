# 0.2.35 – Image add crash fix (stimulus + solution)
Crash: IllegalStateException "Horizontally scrollable component was measured with an infinity maximum width".
Cause: EdThumbnail's action Row used horizontalScroll; inside the stimulus image strip (also horizontalScroll) this nests two horizontal scrolls.
0.2.34 only disabled the inner scroll for the stimulus strip.
0.2.35: EdThumbnail action buttons now use FlowRow (no scroll at all), so no placement can nest scrolls. Unused `actionsScrollable` parameter kept for source compatibility.
File: app/src/main/java/com/questionbank/app/ui/question/EditorDesign.kt
