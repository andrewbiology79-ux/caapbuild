package com.questionbank.app.data.repository

import kotlinx.coroutines.CancellationException

/**
 * Runs a catalog write that can be refused by a database constraint (for example a duplicate category name)
 * and turns the refusal into `false`, so the screen shows a message instead of crashing (v0.2.31-phase5-wip2, P-60).
 * Cancellation is never swallowed.
 */
internal inline fun safeWrite(block: () -> Boolean): Boolean =
    try { block() } catch (e: CancellationException) { throw e } catch (_: Exception) { false }
