# WP5a – Abnahme-Screenshots

Jede Dashboard-Seite bei 1440 px, in **beiden Themes**, gegen den lokalen Dev-Server und die lokale Datenbank.
Erzeugt mit `pnpm screenshots docs/screenshots/wp5a` (Daten aus `pnpm seed:demo`).

| Datei | Zeigt | Figma |
|---|---|---|
| `experiments-all-shops-*` | Liste unter „All shops": Shop als Unterzeile, Sortierung Running → Paused → Draft → Ended, alle fünf Result-Zustände | 2-21 `list · all shops` |
| `experiments-one-shop-*` | Liste mit gewähltem Shop: keine Shop-Zeile | 2-21 `list · shop selected` |
| `experiment-form-new-*` | Formular, ausgefüllt, beide CodeMirror-Editoren | 2-22 Hauptframe |
| `experiment-form-shop-select-*` | Aus „All shops" geöffnet: Shop ist das erste Feld | 2-22 State 1 |
| `experiment-form-aov-visible-*` | AOV als Primärmetrik (Warnung aus Vertrag 4.8) **und** Selektorfeld beim Trigger „scrolls into view" | 2-22 States 2 + 3 |
| `experiment-form-errors-*` | Inline-Validierung: vergebener Key, Regex kompiliert nicht, Splits ≠ 100 % | 2-22 State 4 |
| `experiment-form-first-test-*` | Erster Test eines Shops: Baseline wird eingegeben, Prognose bleibt leer | 2-22 State 5 |
| `experiment-form-futility-*` | Prognose über sechs Wochen: amber plus Futility-Hinweis (ADR-0036) | 2-22 State 6 |
| `experiment-form-edit-running-*` | Vertrag 4.6: Warnbanner, gesperrte Felder mit Schloss | – |
| `experiment-detail-draft-*` | Draft: Start, kein QA-Block (Force-Links wirken dort nicht) | – |
| `experiment-detail-running-*` | Running: Pause, QA-Force-Links, Setup, History | – |
| `shops-*` | Status, laufende Tests, letzte Reconciliation; Allowlist nur für ADMIN | – |
| `users-*` | Einladen mit Rolle, Shop-Zuordnung für CLIENT | – |
| `reconciliation-*` | Shop-gebundene Läufe (Daten ab WP6) | – |
| `shop-detail-wp3-*` | Die WP3-Seite läuft unverändert weiter | – |
| `styleguide-*` | Alle Komponenten in jeder Variante, inkl. der in dieser Session dazugekommenen | Foundations |

Nicht als Screenshot dabei ist der RPV-Fall (2-22 State 7): die abgeleitete Zahl ist dort eine **Untergrenze**, kein
Versprechen, und das steht im Tooltip statt im Bild. Die Rechnung dahinter ist in `planner.test.ts` festgenagelt
(„RPV is a floor", „RPV inverts sampleSize").

Das Skript bricht ab, wenn eine Seite die ErrorBoundary rendert – ein Screenshot der Fehlerseite sähe sonst aus wie
ein Beleg.
