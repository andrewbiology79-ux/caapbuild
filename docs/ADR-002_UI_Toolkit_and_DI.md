# ADR-002 — UI toolkit and dependency injection

Status: ACCEPTED (decision by project owner, 17 November 2026). Implementation is staged and UNCONFIRMED until CI is green.
Related: plan section 29.2 (Step B), section 14 (ADR-001), rule "UI never calls DAOs directly".

## Decision
1. UI toolkit: Jetpack Compose (Material 3), single-activity.
2. Dependency injection: Hilt, processed with KSP only (no KAPT).
3. Navigation: Navigation Compose, one NavHost, route names defined in one place.

## Why
- One coherent DI approach is required by plan section 5 (no service locators or ad hoc construction mixed in).
- Hilt gives compile-time graph validation, which suits a project whose build has no device feedback loop except CI.
- The project already runs KSP for Room; Hilt via KSP adds no second annotation-processing system.
- Compose fits the planned screens (paged lists, editor, paper builder) and Paging 3 (plan 29.3).

## Rejected
- Views/XML + Fragments: more boilerplate for the planned list and editor screens; no benefit for a new app.
- Koin / manual DI: no compile-time graph check; errors would appear on a device, not in CI.
- KAPT for Hilt: KAPT already failed once on Kotlin metadata versions (KAPT_METADATA_COMPATIBILITY.md).

## Consequences
- MainActivity must extend ComponentActivity (Hilt does not support plain android.app.Activity).
- QuestionBankDatabase is a Hilt singleton created by QuestionBankDatabase.create(context), the same factory the tests use.
- DAOs are not exposed to the UI layer. Repositories (Step D) are the only DAO consumers and are injected into ViewModels.
- Version choices are recorded in DEPENDENCY_FREEZE.md; none is frozen until CI proves it.

## Staging (one risky change per CI run)
- v0.2.19: Hilt only (this package).
- v0.2.20: Compose + Navigation Compose, empty home screen replaces the TextView.
- v0.2.21: release build variant, then freeze document finalised.
If a stage fails CI, fix or revert that stage only; do not combine it with the next one.

বাংলা সারাংশ: UI = Compose, DI = Hilt (KSP), navigation = Navigation Compose। ধাপে ধাপে যোগ হবে; প্রতিটি ধাপ CI সবুজ না হওয়া পর্যন্ত যাচাই-না-হওয়া।
