# v0.2.31-phase5-wip2

Phase 5 reference-data UI package (WIP1 + audit fixes). Not a release. Build and tests NOT run (Gradle 8.14.3 could not be downloaded).

Fixed in WIP2 (plan v1.48, section 57): duplicate category name on rename no longer throws (P-58); Reference screens keep one Flow (P-59); clearer messages for linked-category archive and empty reassign targets (P-61); package naming and plan files tidied (P-60).
Added: androidTest ReferenceCatalogTest (7 tests). Expected after a green run: 145 unit / 109 emulator (unconfirmed).
No Room entity, table, column or database-version change; identityHash must stay 786b471dfa14c9ae4739bb81479bab25.
