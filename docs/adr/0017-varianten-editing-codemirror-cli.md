# ADR-0017: Varianten-Editing: JS/CSS-Felder im Dashboard (CodeMirror 6), CLI als Zusatz, kein WYSIWYG

Datum: 2026-09-20 · Status: entschieden

## Kontext
Die Agentur baut Varianten als Code. Ein visueller Editor wäre der größte Teil eines kommerziellen Tools und das größte Risiko für Snippet-Größe und Stabilität.

## Entscheidung
Pro Variante ein JS- und ein CSS-Feld als CodeMirror-6-Editor im Experiment-Formular; komplettes Formular im UI. CLI `sh-ab` (`push`, `start`, `pause`, `stop`, …) spricht dieselbe JSON-API und dieselbe Service-Schicht. Editing-Regel 4.6 gilt für beide.

## Alternativen
- Visual/WYSIWYG-Editor – Nicht-Ziel (konzept.md).
- Nur CLI/Git – Hürde für Nicht-Devs im Team, kein schneller Hotfix.
- Plain `<textarea>` – keine Syntax-Hervorhebung, Fehler erst im Shop sichtbar.

## Konsequenzen
- CodeMirror 6 ist die einzige UI-Abhängigkeit jenseits von DESIGN.md.
- Keine Business-Logik in Routen oder CLI – eine Service-Schicht.
