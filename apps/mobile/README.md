# Taxi Alexandria — Mobile (Flutter)

Passenger app, Clean Architecture (Folder Structure §3).

## Phase 2 scope

Folder scaffolding, `pubspec.yaml`, `analysis_options.yaml` (`flutter_lints`, Coding Standards §4), and a placeholder `main.dart` — no Trip/Fare/Maps/GPS/Rewards/Ads/Auth business logic, all excluded from Phase 2 by name (docs/21-phase2-foundation-audit.md).

## Verification status — read before trusting this scaffold

**The Flutter SDK is not installed in the environment this scaffold was built in**, so unlike the backend and admin-web (both actually installed, linted, type-checked, tested, and built during Phase 2), this app's `pubspec.yaml`, lints, and widget test have **not** been executed against a real Flutter toolchain. They are written to the correct, current Flutter/Dart conventions as of this writing, but the first thing to do in an environment with Flutter available is:

```
flutter pub get
flutter analyze
flutter test
```

...and fix whatever that surfaces before trusting this scaffold further. This is called out explicitly, not silently assumed working — see `docs/21-phase2-foundation-audit.md` for the full accounting of what was and wasn't verified in Phase 2.
