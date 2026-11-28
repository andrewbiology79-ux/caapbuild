# Paper Snapshot Design — v1.70

## Source model
Paper items can be sourced from Type_CQ or Chapter_CQ. Each source is resolved by its own DAO projection; source IDs are not assumed globally unique.

## Snapshot contract
At insertion, source text/metadata and ordered solution text are encoded as JSON with `schemaVersion=1`. Later source edits/deletions must not rewrite the stored snapshot. A future schema version requires a codec migration and explicit compatibility policy.

## Independent media
Any image needed by a paper is copied to `paper_media`, hashed, and linked through existing paper image/placement tables. Question-scope cleanup must never delete paper-owned media.

## Overrides and output
Per-item question/stimulus/answer/solution overrides and marks are separate from the base snapshot. Validation uses snapshot plus overrides and checks media hashes. PDF export reads only the snapshot/override and paper-owned media, applying stored placement.

## Open
Schema migration beyond v1, full visual preview, Bengali font embedding, page-break/layout acceptance, large paper performance and source-deletion round-trip acceptance are not verified.
