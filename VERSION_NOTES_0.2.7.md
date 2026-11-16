# Version 0.2.7 - CI run 9 fix

CI evidence (gradle-build.log): :app:kspDebugKotlin failed with Room error
"There are multiple indices with name index_<table>_question_id_position" for
ChapterCqSolutionPartsEntity and TypeCqSolutionPartsEntity. Entity recognition now works.

Cause: each entity declared Index(question_id, position) twice (unique = false and unique = true).
Fix: kept only the unique index (it also serves ordered lookups). The canonical SQL keeps its
UNIQUE(question_id, position) plus the redundant idx_*_solution_parts_order; Room has no equivalent
non-unique duplicate. All entities were scanned: no other duplicate Room index names.

Not verified: further errors after KSP (Kotlin compile, tests, APK) - run CI again.
