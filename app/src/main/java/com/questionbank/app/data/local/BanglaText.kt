package com.questionbank.app.data.local

import java.text.Normalizer

/**
 * Text normalization for searchable content (finding F-2).
 *
 * The letters য় (U+09DF), ড় (U+09DC) and ঢ় (U+09DD) can be typed or pasted either as one
 * precomposed code point or as base letter + nukta (U+09BC). Unicode lists the precomposed forms as
 * composition exclusions, so NFC maps both spellings to the same base+nukta sequence. NFC also unifies
 * split and composed vowel signs (for example U+09C7 U+09BE and U+09CB), which the FTS tokenizer treats
 * as word characters.
 *
 * Rule: apply [normalize] to question text and short answers BEFORE they are written, and to every
 * search query BEFORE it is sent to FTS. FTS triggers copy the stored columns as they are, so the
 * database never has to know about this.
 */
object BanglaText {
    fun normalize(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFC)
}
