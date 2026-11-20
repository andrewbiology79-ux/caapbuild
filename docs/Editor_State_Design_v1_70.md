# Editor State Design — v1.70 source summary

## Domain boundary
Type_CQ and Chapter_CQ remain independent workflows while reusing shared presentation/state conventions. New-question and edit flows must not share a draft key that can overwrite the other workflow.

## Persistence expectations
Draft changes are expected to survive navigation/process recreation according to the source draft repository. Saved question operations use repository/DAO transaction boundaries and must report success only after the write contract succeeds.

## Modes
Minimum and Full Editor are intended to expose different editing affordances over the same question semantics. The plan retains the need for one normalized draft model and lossless mode switching.

## Open requirements
The original 146 numbered behavior matrix was not supplied. Undo/Redo coverage, all mode-switch round trips, unsaved draft/process-death policy, Chapter_CQ multi-block editing, all image/block operations, math rendering and complete acceptance mapping are not closed. This document does not invent the missing 146 items.
