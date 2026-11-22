# 0.2.36 – "Canvas: trying to use a recycled bitmap" fix
Cause: MediaThumbnail (and ImagePreviewDialog / ImageEditDialog) called Bitmap.recycle() on dispose/replace while Compose still drew the bitmap on the render thread.
Fix: removed all recycle() calls in UI composables; bitmaps are freed by GC. (Pipeline/PDF-export recycle of private temp bitmaps is unchanged.)
Files: EditorImageAttachments.kt, ImagePreviewDialog.kt, ImageEditDialog.kt
Also contains 0.2.35 (FlowRow in EdThumbnail, no nested horizontal scroll).

# 0.2.37 – hardening
- MediaThumbnail: decode wrapped in try/catch (incl. OutOfMemoryError) so a bad/huge file shows "ছবি অনুপলব্ধ" instead of crashing.
- EdStimulusImages: each thumbnail wrapped in key(imageId) so adding/removing/reordering never reuses another image's state.

# 0.2.38 – image layout like the old app
- Picture is larger (full picture visible, Fit), fixed-width card; red cross at the corner removes it; tapping the picture opens the large preview.
- Under the picture, one line: replace, save (export), edit. The separate "large preview" button and the stimulus top/bottom + left/right buttons were removed.

# 0.2.39 – image edit crop bars
Each crop edge (উপর/নিচ/বাম/ডান) now has a fine slider (0.1% steps, like the old app's bar) plus a box beside it to type an exact value (e.g. 12.5). Slider and box stay in sync; opposite-edge limit (max 90% total) still applies.
File: ImageEditDialog.kt (CropRow)

# 0.2.40 – crop: finer and no limit
Crop edges now go 0–100% each, independently (no 90% total cap), in 0.01% steps (slider and typed box). If edges overlap, at least 1 px is kept so the picture never becomes empty.

# 0.2.41 – crop − / + buttons
Each crop edge keeps its slider and typed box and now also has − and + buttons around the box (one tap = 0.01%).

# 0.2.42 – resize dropdown in image edit window
Ribbon under the title shows the current resolution (W×H of the live preview) and a resize dropdown: "রিসাইজ নেই", 1024×350, 1024×400, then "+ নতুন মাপ যোগ করুন" (width/height, 1–2048 px). Added sizes are saved (SharedPreferences image_edit_prefs) and listed next time. Resize scales the whole picture to exactly the chosen size after rotate/crop/scan (stretch allowed, no cropping).
