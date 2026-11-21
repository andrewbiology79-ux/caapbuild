# CI fix for run 84 (package 0.2.33)
- EditorDesign.kt: added missing import androidx.compose.material3.AlertDialog
- ImageEditDialog.kt, ImagePreviewDialog.kt: removed bad import androidx.compose.foundation.layout.weight (internal; Modifier.weight works in Row/Column scope without import)
