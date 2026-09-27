# ADR-0032: Order → Visitor in der Auswertung: Identität ist `Order.customerId`, sonst die Order selbst

Datum: 2026-09-23 · Status: entschieden

## Kontext
Vertrag 4.8 definiert die Conversion Rate auf **konvertierenden Visitors**: „Ein Visitor mit drei Orders konvertiert
einmal". Das Datenmodell kann das nicht exakt: Nichts verbindet eine Order mit einer `visitorId`. Das Cart-Attribut
`_ab` (Vertrag 4.1, eingefroren) trägt nur `<experiment>:<variant>`, `OrderAttribution` ist
`(orderId, experimentId, variantId, source)`, und `Exposure.customerId` ist nur gesetzt, wenn der Visitor während des
Besuchs eingeloggt war (4.5, Login-Link). Ohne Entscheidung rechnet jede Session die CR anders – und 4.8 zu ändern ist
ausgeschlossen.

Betroffen sind drei Regeln aus 4.8 gleichzeitig: der CR-Zähler, „Revenue pro Visitor", und „Orders mit Attribut, aber
ohne passende Exposure zählen nicht".

## Entscheidung
Eine Conversion ist eine **Identität**: `Order.customerId`, wenn die Order eine hat, sonst die Order selbst
(`order:<id>`). Konkret in `app/services/stats.server.ts`:

- **Konverter** = `COUNT(DISTINCT COALESCE(Order.customerId, 'order:' || Order.id))` über die zählenden attribuierten
  Orders. `evaluate()` kappt Konverter auf Visitors (CR nie > 100 %) und schreibt eine Warnung in den Output, wenn die
  Kappung greift.
- **Revenue pro Visitor** wird über dieselbe Identität gruppiert; die Vektorlänge ist die Visitor-Zahl, Nicht-Käufer
  sind Nullen.
- **Fensteruntergrenze**: `Exposure.firstSeenAt`, wo die Order über `Exposure.customerId` verknüpfbar ist, sonst
  `Experiment.startedAt`.
- **Keine passende Exposure**: Hat der Kunde der Order überhaupt eine Exposure im Experiment, aber keine, die zur
  Variante passt und vor der Order liegt, fällt die Order raus – das ist genau die 4.8-Regel. Gast-Orders ohne
  `customerId` können nicht geprüft werden und bleiben drin.
- **Tainted Days** (ADR-0026): Eine Order fällt raus, wenn ihr eigenes Datum (in `Shop.timezone`) tainted ist oder alle
  Exposures ihres Kunden auf tainted Tage fallen bzw. Bots sind.
- **Device-Split**: Orders und Umsatz je Device gibt es nur für verknüpfbare Orders. Nicht verknüpfbare landen in
  keinem der drei Device-Buckets; `stats.server` liefert `deviceLinkRate` und `ordersWithoutDevice`, damit die
  Results-Seite (WP5) beschriften kann, auf welchem Anteil die Device-Zahlen stehen. Visitors je Device sind exakt.

## Alternativen
- **`OrderAttribution.visitorId` persistieren** (Migration + Backfill, Füllung über `Exposure.customerId`): löst
  dieselbe Identität auf und ist für Gast-Orders genauso null – kauft Query-Tempo, keine Genauigkeit. Zurückgestellt
  als reine Optimierung, falls der Lasttest das 500-ms-Ziel verfehlt. Verfehlt er nicht (396 ms Median bei 1 Mio.
  Exposures, WP4).
- **Jede Order = eine Conversion**: einfachste Query, verletzt aber die Binomialannahme des z-Tests und damit 4.8 /
  ADR-0011.
- **visitorId ins Cart-Attribut**: Vertragsänderung an 4.1, ausgeschlossen.

## Konsequenzen
- Mehrfachkäufe eines eingeloggten Kunden zählen **einmal** (richtig). Mehrfachkäufe eines Gasts ohne `customerId`
  zählen **mehrfach** – eine bekannte, kleine Verzerrung der CR nach oben. Shopify legt bei den meisten Bestellungen
  auch im Gast-Checkout einen Customer an, deshalb ist der Effekt klein.
- Die Verzerrung wirkt in beiden Armen gleich; ein **Lift** ist davon deutlich weniger betroffen als ein **Niveau**.
  Für 4.8s Urteil (Lift) ist das die richtige Reihenfolge der Fehler.
- Die Device-Aufteilung von Orders ist unvollständig und muss im UI als solche ausgewiesen werden. Das ist eine
  Vorgabe an WP5, keine Freiheit.
- Dokumentiert in `lib/stats/README.md`; Unit- und DB-Tests decken jede der Regeln oben einzeln ab.
- Phase 2 kann die Identität exakt machen, wenn ein eigener Kanal die `visitorId` server-seitig an die Order bindet
  (z. B. Web-Pixel oder Checkout-Extension). Das ist eine neue Entscheidung, kein Nachziehen dieser hier.
