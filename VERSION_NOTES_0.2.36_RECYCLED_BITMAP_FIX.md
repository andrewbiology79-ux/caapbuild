# 0.2.36 – "Canvas: trying to use a recycled bitmap" fix
Cause: MediaThumbnail (and ImagePreviewDialog / ImageEditDialog) called Bitmap.recycle() on dispose/replace while Compose still drew the bitmap on the render thread.
Fix: removed all recycle() calls in UI composables; bitmaps are freed by GC. (Pipeline/PDF-export recycle of private temp bitmaps is unchanged.)
Files: EditorImageAttachments.kt, ImagePreviewDialog.kt, ImageEditDialog.kt
Also contains 0.2.35 (FlowRow in EdThumbnail, no nested horizontal scroll).

# 0.2.37 – hardening
- MediaThumbnail: decode wrapped in try/catch (incl. OutOfMemoryError) so a bad/huge file shows "ছবি অনুপলব্ধ" instead of crashing.
- EdStimulusImages: each thumbnail wrapped in key(imageId) so adding/removing/reordering never reuses another image's state.
