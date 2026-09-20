# ADR-0013: Config-Delivery: Shop-Metafield `$app:sh_ab.client`, inline im Liquid

Datum: 2026-09-20 · Status: entschieden

## Kontext
Das Snippet braucht die Experiment-Konfiguration beim Seitenaufbau, ohne zusätzlichen Request und ohne Abhängigkeit von unserem Server zur Laufzeit.

## Entscheidung
App-owned Shop-Metafield `$app:sh_ab`, Key `client`, Typ `json` (Vertrag 4.2); die Extension rendert es inline als `window.__shab`. Nur `RUNNING`-Experimente stehen drin; Pausieren/Beenden entfernt sie – das ist der Kill Switch. Key `server` ist für Phase 3 reserviert (4.3).

## Alternativen
- Config per Fetch vom App Proxy – ein Request pro Seite, Flackern, Ausfall = kein Test.
- Config im Extension-Asset gebaut – jedes Experiment-Update wäre ein Deploy.

## Konsequenzen
- Null Runtime-Abhängigkeit: fällt die App aus, laufen die Shops mit letzter Config weiter.
- Metafield-Größenlimit muss überwacht werden (WP3); Propagationszeit auf dem Dev Store messen.
