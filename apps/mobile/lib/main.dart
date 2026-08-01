import 'package:flutter/material.dart';

/// Phase 2 scope (docs/21-phase2-foundation-audit.md): folder scaffolding
/// only. This placeholder app has no Trip/Fare/Maps/GPS/Rewards/Ads/Auth
/// business logic — those are excluded from Phase 2 by name and belong to
/// the phases that implement each (Roadmap, docs/15-roadmap.md).
void main() {
  runApp(const TaxiTawsilaApp());
}

class TaxiTawsilaApp extends StatelessWidget {
  const TaxiTawsilaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Taxi Alexandria',
      home: Scaffold(
        appBar: AppBar(title: const Text('Taxi Alexandria')),
        body: const Center(
          child: Text('Phase 2 foundation — no business features yet.'),
        ),
      ),
    );
  }
}
