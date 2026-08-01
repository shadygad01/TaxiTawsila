import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:taxitawsila_mobile/main.dart';

void main() {
  testWidgets('renders the Phase 2 placeholder screen', (WidgetTester tester) async {
    await tester.pumpWidget(const TaxiTawsilaApp());

    expect(find.text('Taxi Alexandria'), findsWidgets);
    expect(find.text('Phase 2 foundation — no business features yet.'), findsOneWidget);
  });
}
