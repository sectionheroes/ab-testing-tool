# ADR-0023: Connection Pooling: Option A – kein Pooler, `connection_limit=10&pool_timeout=5`

Datum: 2026-09-20 · Status: entschieden

## Kontext
`Instanzen × connection_limit` muss unter `max_connections` des Postgres-Plans bleiben (kleine Pläne ~100, Render reserviert 10). Render Starter läuft mit genau einer Instanz; Last < 10 req/s.

## Entscheidung
Prisma-URL mit `connection_limit=10&pool_timeout=5`, kein PgBouncer, kein Accelerate. WP1 liest `max_connections` des gewählten Plans im Render-Dashboard ab und notiert es in `STATUS.md`.

## Alternativen
- B – Render PgBouncer (Port 6432, Transaction-Mode, `pgbouncer=true`) – erst sinnvoll bei > 1 Instanz; Wechsel ist eine Env-Var.
- C – externer Pooler-Dienst – Kosten und Abhängigkeit ohne Bedarf.
- rahmen.md-Vorschlag (`maxInstances=3`, `connection_limit=5`) – ging noch von Autoscaling aus.

## Konsequenzen
- Kurzes `pool_timeout`: Beacons scheitern unter Last schnell statt zu hängen – der Client sendet erneut (ADR-0014).
- Wer manuell hochskaliert, muss gleichzeitig auf B umstellen.
