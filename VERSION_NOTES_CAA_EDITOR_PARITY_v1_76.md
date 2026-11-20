# Version notes — CAA Editor parity pass v1.76

Date: 21 November 2026

Base package: `QuestionBank_v1_75_CAAP_UI_COMPILEFIX.zip`

## Changes

This update starts the next CAA alignment pass in the native Android Minimum/Full Editor:

- New Type_CQ form starts with the CAA default two blocks, গ and ঘ, with 3/4 marks and 3/4 ratings.
- Editor opens in Minimum mode even when restoring a draft from an earlier Full-mode session; draft content is preserved.
- Full mode adds the question list count, add-block and confirmed-delete controls.
- Full mode on the new-question form can move a block into an unused ক/খ/গ/ঘ slot while keeping the associated content and metadata together.
- Full-mode edit can add a missing label and remove pending or persisted group questions using the existing transactional update.
- TextField row counts match the CAA reference: stimulus 2/4, question 2/3, solution 2/3 for Minimum/Full.
- Chapter_CQ editor mode also resets to Minimum after draft restoration; the underlying Chapter_CQ single-question design is not yet replaced.
- Reference palette, dimensions and dark live-preview surface received a first alignment pass.

## Compatibility and known gaps

The existing Type_CQ data/editor adapter has four fixed label slots and supports one question per label. This package does not enable duplicate same-label blocks, arbitrary block counts, or persisted label reassignment. The Full-mode sort action reports that the existing k/kh/ga/gha order is already normalized; a free reorder model is not introduced.

KaTeX, cursor-aware math insertion, hierarchy card inside the editor, full image edit queue and in-editor viewer, CAA solution marker parser/serializer, full dirty/confirmation/accessibility parity and a shared Chapter_CQ group editor remain open. See `CAA_EDITOR_IMPLEMENTATION_STATUS_v1_76.md` for the detailed matrix.

No database schema/migration or Gradle dependency change was made. The app version in Gradle was not bumped.

## Build status

Source candidate only. Gradle could not start project tasks in the working environment because Gradle 8.14.3 was not cached and the wrapper could not resolve `services.gradle.org` (`UnknownHostException`). No compile, KSP, unit-test, instrumentation, APK or emulator result is claimed for v1.76.
