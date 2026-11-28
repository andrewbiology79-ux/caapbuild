# DAO / Repository Contract — v1.70 source inventory

## Separation
- Type_CQ DAOs/repositories own Type_CQ hierarchy, question group and image references.
- Chapter_CQ DAOs/repositories own Chapter_CQ questions, solutions and media references. Chapter_CQ has no Topic layer.
- Shared DAO owns paper, categories where schema specifies them, board catalog, operation journal and cross-scope picker projection.
- Repositories enforce validation and transaction contracts; UI should not issue direct relational writes.

## Paper boundary
Paper source resolution is scope-specific. `PaperSnapshotCodec` stores source content at insertion; later paper display/export uses the snapshot and copied `paper_media`, not live question text. Section/item order operations must be complete-set transactions and item order is scoped to a section.

## Media boundary
ImagePipeline coordinates file operations with journal rows and metadata DAOs. `ImageReferenceResolver`, `ImageIntegrityChecker` and `OrphanMediaCollector` split specialized concerns. `MediaSnapshotCoordinator` serializes in-process mutation and backup snapshots.

## Known contract gaps
Current source candidate remains uncompiled/unverified. Some screens still have data-layer coupling; broad Chapter_CQ/shared DAO behavior, transactional failure rollback and repository round-trip acceptance remain open.
