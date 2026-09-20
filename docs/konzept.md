# Konzept – A/B-Testing-Tool für Sectionheroes-Kunden

*Warum wir das Tool bauen, was es können soll und was ausdrücklich nicht. Ändert sich selten. Wie es gebaut wird, steht in `plan.md`; wo wir stehen, in `STATUS.md`.*

## 1. Problem

Wir sind eine CRO-Agentur für Shopify-Shops. Unser Kerngeschäft ist es, Hypothesen zu testen und Kunden zu sagen, was ihren Umsatz erhöht. Dafür brauchen wir A/B-Tests, deren Zahlen wir ohne Vorbehalt in ein Kunden-Reporting schreiben können.

Das ist heute nicht der Fall. Bei einem Kunden wichen die Tagesumsätze unseres A/B-Tools an einzelnen Tagen um das Drei- bis Vierfache von den Shopify-Zahlen ab. Ursache war ein Währungsfehler im Tracking, der inzwischen mit einem Workaround behoben ist. Aber der Vorfall hat ein grundsätzliches Problem sichtbar gemacht: **Das Tool zählt Käufe im Browser des Besuchers. Shopify zählt sie im System. Wenn beide auseinanderlaufen, können wir nicht sagen, ob das normal ist oder ein Fehler – weil das Tool seine Zahlen nirgends gegen Shopify verifiziert.** Wir haben den Fehler nur gefunden, weil jemand von Hand drei Datenquellen verglichen hat. Wochen später.

Dazu kommt: Wir wollen perspektivisch Preise und Versandkonditionen testen. Das kann ein Tool, das nur im Browser arbeitet, prinzipiell nicht – es kann einen Preis anzeigen, aber nicht durchsetzen. Der Checkout rechnet, was Shopify sagt.

## 2. Build vs. Buy

**Varify behalten.** Der Währungs-Workaround funktioniert. Für den relativen Vergleich "A gegen B" ist Tracking im Browser meist ausreichend, weil Datenverluste (Ad-Blocker, Browser-Eigenheiten) beide Gruppen gleich treffen. Was fehlt: Verifizierbarkeit gegen Shopify, Netto-Umsatz nach Retouren, Preis- und Versandtests, Tests als Code in unserer Versionsverwaltung, ein Dashboard über alle Kunden, Automatisierbarkeit. Lizenz pro Shop.

**Spezialisiertes Tool kaufen.** Es gibt Anbieter, die Bestellungen serverseitig zuordnen und Preistests können. Sie sind auf große US-Shops ausgelegt und entsprechend bepreist, ihr Workflow ist ihrer, nicht unserer, und unsere Daten liegen bei ihnen.

**Selbst bauen.** Ein Tool, das genau das kann, was wir brauchen. Die Zuordnung eines Kaufs zu einer Testvariante wird in die Shopify-Bestellung selbst geschrieben und von Shopify an uns gemeldet – nicht vom Browser. Damit sind unsere Zahlen per Konstruktion gegen Shopify prüfbar. Der Preis: sechs bis zehn Wochen Entwicklung, dauerhafte Wartung, und wir tragen die Verantwortung, wenn im Kunden-Shop etwas nicht lädt.

**Entscheidung: bauen.** Nicht, weil unser Tracking "genauer" wäre – das ist es nur in Teilen – sondern weil es *überprüfbar* ist, weil wir Preis- und Versandtests brauchen, und weil der Workflow zu uns passen soll.

## 3. Ziele

1. **Jede Zahl im Report ist gegen Shopify verifizierbar.** Ein täglicher Abgleich bestätigt das automatisch; jede Abweichung ist ein Alarm.
2. **Ein Test ist Code.** Varianten werden als CSS und JavaScript geschrieben, versioniert, reviewbar – im Dashboard oder aus dem Repository.
3. **Ein Dashboard für alle Kunden.** Laufende Tests, Ergebnisse, Learnings an einem Ort.
4. **Statistik, der man trauen kann.** Kein "Gewinner", bevor die geplante Stichprobe erreicht ist. Kein Ergebnis ohne Prüfung, ob die Zuteilung sauber war.
5. **Die Basis für Preis- und Versandtests ist von Anfang an gelegt.** Die Mechanik, die einen Kauf einer Variante zuordnet, ist dieselbe, die später Rabatte und Versandoptionen steuert.
6. **Kein Schaden im Kunden-Shop.** Wenn unser Code nicht lädt oder fehlschlägt, sieht der Besucher das Original. Immer.

### Nicht-Ziele

- **Kein visueller Editor.** Niemand klickt sich Varianten zusammen. Wer einen Test baut, schreibt Code – das sind bei uns die Entwickler.
- **Kein Produkt für Dritte** (siehe §9). Keine Abrechnung, kein Onboarding-Flow, kein Support-System, keine sichtbare Listung im App Store. Die App geht trotzdem durch den Shopify-Review, weil Public Apps sonst nur auf Development Stores installierbar sind – der Review ist Pflicht, kein Produkt-Feature. Wer sie installiert, kann sie erst nutzen, wenn wir den Shop freischalten.
- **Kein Checkout-Test** ohne Shopify Plus – geht plattformseitig nicht.
- **Keine Personalisierung**, keine Segmente, kein Targeting nach Personendaten. Zufallszuteilung, sonst nichts.
- **Kein Ersatz für Web-Analytics.** Sekundärmetriken (Scrolltiefe, Klickpfade) bleiben im Analytics-Tool des Kunden; unser Tool liefert dorthin nur, wer welche Variante gesehen hat.
- **Keine Echtzeit-Urteile.** Besucher, Bestellungen und Umsatz sind live sichtbar – für QA, Monitoring und die Notbremse. Ob eine Variante *gewonnen* hat, sagt das Tool erst, wenn die geplante Stichprobe voll ist. Live-Zahlen ja, Live-Signifikanz nein.

## 4. Nutzer und Rollen

| Rolle | Wer | Macht |
|---|---|---|
| Stratege | Joel, Julian | Legt Tests an, formuliert Hypothese und Primärmetrik, liest Ergebnisse, entscheidet über Gewinner, kommuniziert an den Kunden |
| Entwickler | Dev-Team | Schreibt Varianten-Code, prüft per QA-Link, meldet fertig |
| Kunde | Shop-Inhaber | Installiert die App einmalig. Phase 1: kein Login, bekommt Ergebnisse von uns. Phase 2: optional Read-only-Zugang auf die eigenen Tests. |
| Automat | Claude, Phase 2 | Legt Tests an, zieht Reports, füllt die Learnings-Datenbank – über dieselbe Schnittstelle wie das Dashboard |

Im Tool gibt es in Phase 1 zwei Rollen: Admin und Mitglied. Feinere Rechte erst, wenn es einen Grund gibt.

## 5. Geplante Tests

Startliste, die zeigt, was das Tool können muss – von Joel und Julian fortlaufend zu ergänzen.

| # | Test | Typ | Phase | Primärmetrik |
|---|---|---|---|---|
| 1 | PDP: Bewertungs-Block über dem Preis statt unter der Buy Box | Code | 1 | Conversion Rate |
| 2 | PDP: Trust-Badges (Versand, Rückgabe, Zahlung) direkt unter Add-to-Cart | Code | 1 | Conversion Rate |
| 3 | PDP (Ohrheld): Ohrscan-Hinweis unter statt über der Buy Box | Code | 1 | Conversion Rate |
| 4 | PDP (Arktisquelle): Hochpreis mit Rahmen – Ratenbetrag und Vergleichswert neben dem Preis | Code | 1 | Umsatz pro Besucher |
| 5 | Cart Drawer: Fortschrittsbalken bis Gratisversand | Code | 1 | Ø Bestellwert |
| 6 | Collection: Sterne-Bewertung auf Produktkarten | Code | 1 | Umsatz pro Besucher |
| 7 | Paid Traffic: Advertorial-Landingpage vs. direkte PDP | Redirect | 2 | Umsatz pro Besucher |
| 8 | Gratisversand ab 39 € vs. ab 59 € | Versand | 3 | Umsatz pro Besucher, Ø Bestellwert |
| 9 | 3er-Bundle 45 € vs. 44,50 € (teilbarer Preis) | Preis | 3 | Umsatz pro Besucher |
| 10 | Charm-Price 29,99 € vs. 30 € | Preis | 3 | Umsatz pro Besucher |

Die Liste zeigt auch, warum die Phasen so geschnitten sind: Sechs von zehn Tests gehen mit reinem Code, einer braucht Weiterleitungen, drei brauchen Eingriffe in Preis oder Versand.

## 6. Statistische Haltung

- **Primärmetrik und Stichprobengröße werden vor dem Start festgelegt.** Das Tool rechnet die Stichprobe aus Basis-Conversion und dem Effekt, den wir mindestens finden wollen.
- **Bis die Stichprobe erreicht ist, zeigt das Tool keine Signifikanz.** Die Zähler laufen live und dürfen jederzeit angeschaut werden – um zu sehen, ob der Test überhaupt läuft, ob die Zuteilung stimmt, ob eine Variante etwas kaputt macht. Was nicht angezeigt wird, sind p-Werte und ein Gewinner. Das ist unbequem und der einzige Weg, mit klassischen Tests ehrlich zu bleiben.
- **Es gibt eine Notbremse, kein Frühurteil.** Bricht die Conversion einer Variante früh und massiv ein, warnt das Tool – als Hinweis auf einen Fehler, nicht als Ergebnis. Stoppen ist dann eine Entscheidung, keine Statistik.
- **Ein Test ohne Gewinner ist ein gültiges Ergebnis.** Er wandert in die Learnings-Datenbank wie jeder andere.
- **Die Zuteilung wird geprüft, nicht angenommen.** Weicht die tatsächliche Verteilung von der gewollten ab, ist das Ergebnis ungültig – egal wie gut es aussieht.
- **Umsatz pro Besucher ist eine schwere Metrik.** Wenige große Bestellungen verzerren sie. Wir nutzen Verfahren, die dagegen robust sind, und misstrauen jedem Umsatz-Gewinner, der an einem Ausreißer hängt.
- **Bevor das Tool ein echtes Ergebnis liefert, muss es beweisen, dass es keinen Unterschied findet, wo keiner ist.** Ein A/A-Test über zwei Wochen auf einem echten Shop ist die Abnahme – nicht ein Demo-Test mit erfundener Variante.
- **Verfahren, die frühes Reinschauen erlauben, kommen später** – und nur, wenn sie genauso gegen simulierte Nullergebnisse validiert sind wie die klassischen.

## 7. Datenqualität als Versprechen

Was wir garantieren:

- **Jede zugeordnete Bestellung ist in Shopify sichtbar.** Die Zuordnung steht als Vermerk in der Bestellung selbst. Wer nachprüfen will, öffnet die Bestellung im Shopify-Admin.
- **Umsatz ist Shop-Währung, netto.** Retouren und Stornos werden abgezogen. Fremdwährungen rechnet Shopify um, nicht wir.
- **Ein Kauf zählt einmal.** Eine Bestellnummer, ein Eintrag.
- **Ein Besucher zählt erst, wenn er die Variante gesehen hat.** Nicht beim Seitenaufruf, sondern wenn die Änderung wirklich sichtbar war.
- **Bots zählen nicht.** Erkannte automatisierte Zugriffe werden ausgeschlossen und ihr Anteil ausgewiesen.
- **Jeden Tag ein Abgleich.** Die Summe unserer zugeordneten Bestellungen wird gegen Shopify geprüft. Abweichung heißt Alarm, nicht Fußnote.

Was wir nicht versprechen können, und offen sagen:

- **Die Besucherzahl bleibt eine Browser-Messung – bei uns wie bei Shopify.** Shopify Analytics zählt Sessions ebenfalls über ein Skript im Storefront; wer das blockt, fehlt dort genauso wie bei uns. Unser Skript läuft über dieselbe Infrastruktur wie Shopifys eigenes und ist entsprechend ähnlich robust. Wer bei uns fehlt, wird auch nicht zugeordnet, wenn er kauft – das trifft beide Varianten gleich und verzerrt den Vergleich nicht. Unsere Zahlen sind trotzdem nicht identisch mit Shopify Analytics: Wir zählen Besucher, die eine Variante *gesehen* haben, Shopify zählt Sessions. Gleiche Messmethode, andere Zähleinheit.
- **Ein Besucher, der das Gerät wechselt, ist ein neuer Besucher.** Für eingeloggte Kunden lösen wir das ab Phase 2; in Phase 1 bleibt die Zuteilung immerhin beim Login auf demselben Gerät stabil, und eine Bestellung ohne Vermerk wird über den Kunden zugeordnet.

## 8. Risiken

| Risiko | Was passiert | Wie wir es begrenzen |
|---|---|---|
| Unser Skript lädt nicht oder wirft einen Fehler | Kunden-Shop flackert oder bricht – das ist Kundenumsatz | Skript liegt auf Shopifys eigener Infrastruktur; Zeitlimit, nach dem immer das Original erscheint; jede Variante läuft isoliert, Fehler = Original |
| Statistik ist subtil falsch | Wir rufen Gewinner aus, die keine sind, und der Kunde baut darauf | Jede Rechnung gegen bekannte Referenzwerte getestet; Simulation mit tausenden Nullergebnissen muss die erwartete Fehlerrate liefern; A/A-Test als Abnahme |
| Datenverlust an einer Stelle, die wir nicht sehen | Zahlen stimmen still nicht | Täglicher Abgleich gegen Shopify, Alarm bei Abweichung |
| Entwickler-Kapazität | Ohne visuellen Editor ist jeder Test ein Dev-Ticket; Test-Velocity hängt am Team | Bewusst akzeptiert – Tests sind bei uns ohnehin Code. Beobachten, ob es zum Flaschenhals wird. |
| Rechtliches: Tracking ohne Einwilligung, Preisdifferenzierung | Abmahnung, Reputationsschaden | Einwilligungsverhalten pro Shop konfigurierbar; Preistests erst nach juristischer Freigabe; keine Personendaten in der Zuteilung |
| Shopify-Review oder Freigabe für Bestelldaten verzögert sich oder lehnt ab | Erster Kunden-Shop kann nicht angebunden werden | Einreichen, sobald das Snippet steht (nach WP3), vier Wochen Puffer, Review-Anforderungen vorher geprüft; Fallback: eine Custom-Distribution-App nur für diesen Shop |
| Wartung | Plattform-Änderungen, Theme-Updates, Browser-Regeln – hört nie auf | Bewusst akzeptiert; der tägliche Abgleich zeigt Brüche sofort |
| Scope Creep | Phase-3-Features rutschen in Phase 1, das Fundament wird nie fertig | Phasen sind hart; die Abnahme des A/A-Tests ist die Bedingung für alles Weitere |
| Zugriff aufs Dashboard oder ein API-Token in fremder Hand | Beliebiges JavaScript auf allen Kunden-Storefronts | Google-Login nur per Einladung, Tokens laufen ab, jede Änderung im Audit-Log; 2FA empfohlen, nicht erzwungen |
| Zwei Wahrheiten im Übergang | Varify und unser Tool laufen parallel, Zahlen weichen ab, Verwirrung beim Kunden | Übergang pro Kunde, nicht schleichend; parallel nur zum Abgleich, nie zum Reporting |

## 9. Weggabelung: intern oder Public App

Das Tool wird als internes Werkzeug gebaut. Nur für unsere Kunden, nicht gelistet, kein Support außer uns selbst.

Die Architektur schließt ein Produkt nicht aus – die Anbindung an Shopify ist von Anfang an die, die auch ein öffentliches Tool bräuchte. Aber ein Produkt wäre ein anderes Projekt: Abrechnung, Onboarding für fremde Merchants, Support-Prozesse, Dokumentation, Sicherheits-Audits, Datenschutz-Verträge mit fremden Merchants, sichtbare Listung. Nichts davon bauen wir jetzt – der App-Review selbst ist schon Pflicht (siehe Nicht-Ziele).

Die Frage stellt sich frühestens nach sechs Monaten Betrieb mit eigenen Kunden, und nur wenn drei Dinge gleichzeitig wahr sind: Die Test-Velocity ist messbar gestiegen. Das Versprechen aus §7 wurde durchgehend gehalten. Und jemand von außen hat gefragt. Bis dahin ist jede Stunde, die in Produkt-Features fließt, eine Stunde weniger für das, wofür wir das Tool bauen.
