# ADR-0031: App-Proxy-Signatur selbst prüfen statt `authenticate.public.appProxy`

Datum: 2026-09-22 · Status: entschieden

## Kontext
Die drei Storefront-Endpunkte `/proxy/e`, `/proxy/link` und `/proxy/err` (Vertrag 4.5) sind der heißeste Pfad der App:
ein Aufruf pro Visitor und Experiment, gesendet mit `fetch keepalive` aus dem Snippet. Sie müssen die App-Proxy-Signatur
prüfen, schnell antworten und dem Snippet exakt die Statuscodes liefern, auf die es reagiert (2xx = Marker setzen und
nie wieder senden, alles andere = beim nächsten Load erneut senden).

`@shopify/shopify-app-react-router` 1.2.1 bringt `authenticate.public.appProxy`. Geprüft (Paketquelle +
`search_docs_chunks`, Stand 22.09.2026):
- Der Algorithmus ist derselbe wie in `/docs/apps/build/online-store/app-proxies/authenticate-app-proxies`:
  `signature` entfernen, alle übrigen Query-Parameter als `key=value` (Mehrfachwerte mit `,` gejoint, unencoded),
  alphabetisch sortiert, ohne Trenner konkateniert, HMAC-SHA256 mit dem App-Secret, hex, konstantzeitiger Vergleich.
- Abweichungen für unseren Fall: er antwortet bei ungültiger Signatur **400** statt 401; er erzwingt über
  `shopify-api`s `validateHmacTimestamp` ein **90-Sekunden**-Zeitfenster (`HMAC_TIMESTAMP_PERMITTED_CLOCK_TOLERANCE_SEC`);
  und er lädt bei jedem Request die Offline-Session aus der DB und erneuert ggf. das Token
  (`ensureValidOfflineSession`), obwohl wir für Exposure, Link und Error keinen Admin-Client brauchen.

## Entscheidung
Eigene Prüfung in `app/services/proxy.server.ts` (`verifyProxySignature`, `authenticateProxy`), rund 30 Zeilen mit
`node:crypto` und dem bestehenden `safeEqual` aus `crypto.server.ts`.

- Getestet gegen **beide** in der Shopify-Doku veröffentlichten Beispiele (Shared Secret `hush`, Shop
  `shop-name.myshopify.com`, anonym und mit `logged_in_customer_id=1`) – die Doku rendert den Shop-Namen als `{shop}`,
  die veröffentlichten Signaturen entstehen mit `shop-name.myshopify.com`. Beide Vektoren liegen als Referenztest in
  `app/services/proxy.server.test.ts`.
- Statuscodes: 405 (kein POST), 400 (kein `shop`), 401 (Signatur fehlt/falsch/zu alt), 204 (Shop unbekannt oder nicht
  ACTIVE – es wird nichts gespeichert, das Snippet setzt seinen Marker und hört auf), sonst Kontext + 204.
- Zeitfenster **5 Minuten** statt 90 Sekunden: `keepalive`-Requests aus einem schlafenden Tab oder bei schlechter
  Verbindung dürfen nicht an einer Uhrzeitgrenze scheitern; 5 Minuten sind weiterhin eine enge Replay-Grenze.
- `customerId` kommt ausschließlich aus `logged_in_customer_id`, nie aus dem Body (Doku: „the app must also verify that
  the `logged_in_customer_id` query parameter matches the customer"). Der `cid` im Body wird nur bei Abweichung geloggt.

## Alternativen
- **`authenticate.public.appProxy` verwenden.** Weniger eigener Code, aber 400 statt 401 (das Snippet unterscheidet zwar
  nur 2xx/nicht-2xx, unsere Logs und Tests nicht), 90-Sekunden-Fenster und ein DB-Roundtrip plus möglicher
  Token-Refresh auf jedem Beacon. Für einen Endpunkt, der pro Seitenaufruf Last erzeugt, ist das unnötig.
- **Gar nicht prüfen und nur auf den `shop`-Parameter vertrauen.** Jeder im Internet könnte Exposures erfinden.
  Ausgeschlossen.

## Konsequenzen
- Wir tragen den Algorithmus selbst. Ändert Shopify ihn, merken wir es an fehlschlagenden Requests; die beiden
  Doku-Vektoren im Test sind die Kontrolle, und WP-R prüft die Proxy-Doku ohnehin erneut.
- Eine Rotation von `SHOPIFY_API_SECRET` muss hier mitgedacht werden: die Prüfung nutzt genau ein Secret aus
  `env("SHOPIFY_API_SECRET")`. Bei einer Rotation müssen für die Übergangszeit beide Secrets akzeptiert werden –
  heute nicht implementiert, bewusst offen (Notiz in STATUS).
- Der Admin-Client steht auf diesen Routen nicht zur Verfügung. Brauchen wir dort je einen, holen wir ihn explizit mit
  `unauthenticated.admin(shop)` – dann aber nur in dem Zweig, der ihn wirklich braucht.
