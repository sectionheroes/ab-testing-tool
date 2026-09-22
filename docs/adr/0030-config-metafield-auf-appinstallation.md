# ADR-0030: Config-Metafield liegt auf der AppInstallation, Namespace `sh_ab` (ohne `$app:`-Präfix)

Datum: 2026-09-22 · Status: entschieden · präzisiert ADR-0013

## Kontext
ADR-0013 und Vertrag 4.2 sagen „app-owned Shop-Metafield `$app:sh_ab`, in Liquid `app.metafields.sh_ab.client`“. Beim Bau des Writers (WP3 3a) zeigte die Dev-Doku: Das Liquid-Objekt `app.metafields` liest **App-data-Metafields auf der AppInstallation**, nicht Shop-Metafields (die wären `shop.metafields[...]`). Und mit dem Präfix `$app:sh_ab` wird der Namespace zu `app--<app-id>--sh_ab`; auf dem Dev Store gemessen: `app.metafields.sh_ab.client` liefert nur den Wert mit dem **einfachen** Namespace `sh_ab`, der `$app:`-Wert ist nur über `app.metafields["$app:sh_ab"].client` erreichbar.

## Entscheidung
`metafieldsSet` mit `ownerId = currentAppInstallation.id`, `namespace = "sh_ab"`, Keys `client` (4.2) und `server` (4.3), Typ `json`. Der Liquid-Pfad `app.metafields.sh_ab.client` aus dem Vertrag bleibt exakt so – er ist die Schnittstelle, auf die das Snippet und die Extension bauen.

## Alternativen
- Shop-Owner mit `$app:sh_ab` – bräuchte `shop.metafields["$app:sh_ab"]` in Liquid, ist im Admin sichtbar und braucht Write-Scopes; passt nicht zum Vertragspfad.
- AppInstallation mit `$app:sh_ab` – funktioniert, aber der Liquid-Pfad wäre die Bracket-Form; unnötig, weil die AppInstallation die Isolation schon liefert (nur die eigene App liest ihre Installation).

## Konsequenzen
- Kein zusätzlicher Access Scope (`read_orders` reicht), Metafield im Admin unsichtbar, Kill Switch unverändert (RUNNING raus = Config leer).
- Limit `json` = 128 KB (API ≥ 2026-04), Guard bei 80 % = 104.857 Bytes; jede Schreibung loggt die Größe.
- Vertrag 4.2 bekommt eine Fußnote, keine Änderung des Schemas oder des Liquid-Pfads.
