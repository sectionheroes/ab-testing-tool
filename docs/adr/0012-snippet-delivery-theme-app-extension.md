# ADR-0012: Snippet-Delivery: Theme App Extension, App Embed Block mit `target: head`

Datum: 2026-09-20 · Status: entschieden

## Kontext
Das Snippet muss auf jeder Seite früh laufen, Theme-Updates überleben und ohne Theme-Code-Änderung aktivierbar sein. Script Tags sind deprecated (kein Anlegen ab 01.10.2026), App-Store-Apps müssen Theme App Extensions nutzen.

## Entscheidung
Theme App Extension `sh-ab-embed` mit App Embed Block `target: head`; das Asset `shab.js` liegt auf `cdn.shopify.com`, Aktivierung per Klick im Theme Editor (Deep-Link von `/app`).

## Alternativen
- Script Tag API – deprecated, für App-Store-Apps nicht erlaubt.
- Theme-Code editieren – nimmt das Theme vom Upgrade-Pfad, Review-Ablehnungsgrund.
- App Block statt Embed Block – müsste in jede Sektion einzeln gesetzt werden.

## Konsequenzen
- Snippet-Budget 8 KB gzip, Lighthouse-Impact ≤ 10 Punkte (Review), unser Ziel ≤ 2 auf der PDP.
- Snippet-Fehler dürfen nie die Seite brechen – try/catch pro Variante.
