# Cahier, tab "Technique et sécurité": extract for the API (read 14 Nov 2026, rev 30)

## Stack lines
- Server: NestJS modular monolith, REST and WebSocket, OpenAPI; API, WebSocket and background jobs in separate processes; sessions in Redis.
- DB: PostgreSQL and PostGIS, **separate schemas for the core and for management** ("schémas séparés pour le cœur et la gestion"), row-level security, separate DB users with minimal rights.
- Events: transactional outbox table plus Redis queue.
- Files: S3-compatible storage.
- Money in millimes, times in UTC shown in Tunis time, deleted business data archived for the D9 period, positions as PostGIS geometry.
- Tools table lists: Argon2id (passwords), NestJS Throttler + Redis (rate limits per account and per IP on sign-in, codes and tracking), CASL (rights), "Prisma, Helmet" (injections, headers), OWASP ZAP, ClamAV, Gitleaks/Trivy/Dependabot, PgBouncer, k6, Coraza. Note: Helmi chose Drizzle on 14 Nov instead of Prisma; the PR must say so.

## API
- Versioned under `/v1`, described in OpenAPI. Each route declares its allowed roles; the server checks them against the "Rôles et droits" matrix. **The OpenAPI file is the reference: a test at every merge compares responses to this file.**
- WebSocket at `/v1/live`, same sessions and rights.

| Route | Actions | Roles | Replay |
|---|---|---|---|
| /v1/sessions | POST, DELETE | any account | No |
| /v1/sessions/google | POST | Particulier, Commerçant | No |
| /v1/phone-checks | POST, POST /verify | Public, limited attempts | No |
| /v1/devices | GET, DELETE /{id} | Driver (own), Logistique, Admin | State |
| /v1/quotes | POST, GET /{id} | Public | No |
| /v1/orders | POST, GET, GET /{id} | Particulier and Commerçant (own), Agent, Opérations, Admin; read Logistique, Service client | Key |
| /v1/orders/{id}/confirm | POST | Agent, Opérations, Admin | State |
| /v1/orders/{id}/cancel | POST | Particulier and Commerçant (own), Agent, Opérations, Logistique, Admin | State |
| /v1/order-imports | POST, GET /{id} | Commerçant | Key |
| /v1/tracking/{number} | GET | Public, limited attempts | No |
| /v1/recipient-links/{token} | GET, PATCH | Recipient with the link | State |
| /v1/missions | GET, POST /{id}/accept, POST /{id}/refuse | Driver (own) | State |
| /v1/missions/{id}/events | POST | Driver (own) | Event |
| /v1/parcels/{id}/proofs | POST | Driver (own) | Event |
| /v1/positions | POST batch | Driver on duty | Event |
| /v1/dispatch/queue | GET | Agent, Logistique, Opérations, Admin | No |
| /v1/dispatch/assignments | POST, DELETE | Logistique, Opérations, Admin | Key |
| /v1/tickets | POST, GET, POST /{id}/messages | Particulier and Commerçant (own), Service client, Agent, Opérations, Admin | Key |
| /v1/invoices | GET | Client (own), Comptable, Direction, Opérations, Service client, Admin | No |
| /v1/credit-notes | POST, POST /{id}/approve, POST /{id}/issue | Service client proposes, Opérations approves, Comptable issues | Key |
| /v1/payments | POST, POST /{id}/cancel, GET | Comptable | Key |
| /v1/cash-sessions | GET, POST /{id}/count, POST /{id}/resolve | Driver (own) read, Caissier counts, Comptable or Direction decides | Key |
| /v1/cod-payouts | GET, POST | Comptable; read Commerçant (own), Direction, Opérations, Admin | Key |
| /v1/price-lists | GET, POST, POST /{id}/approve | Opérations and Admin prepare, Direction approves; read Comptable | Key |
| /v1/zones | GET, POST, PATCH | Admin, Opérations, Logistique; read Direction | No |
| /v1/users | GET, POST, PATCH | Admin | No |
| /v1/audit-events | GET | Direction, Admin | No |
| /v1/partner/orders (L2) | POST, GET | Commerçant with API key | Key |
| /v1/partner/webhooks (L2) | POST, GET, DELETE | Commerçant with API key | No |

Replay column: how a resend has no effect: by a key, by the event id, or because the state already changed.

## Idempotency
- Route with key: client sends `Idempotency-Key` header with a UUID. **Key kept 24 h with a fingerprint of the request.**
- Same key, same content: server returns the original response and does nothing again (R202).
- Same key, other content: **409 `KEY_REUSED`**.
- Driver event: the phone creates `event_id` and `occurred_at` at the time of the action. Server ignores an `event_id` already received and records the reception time (R402).

## Error format (NOT RFC 9457)
All errors have the same shape. The message follows `Accept-Language`; the code never changes.
```json
{ "error": { "code": "STATE_CONFLICT", "message": "Ce colis est déjà remis.", "fields": [], "trace_id": "01J9Z6K2M4" } }
```
| HTTP | Code | When |
|---|---|---|
| 400 | VALIDATION_FAILED | missing or invalid field, detailed in `fields` |
| 401 | AUTH_REQUIRED | session missing or expired |
| 403 | ACCESS_DENIED | role lacks the right |
| 403 | SAME_ACTOR | person validates their own work |
| 404 | NOT_FOUND | resource missing, or owned by someone else |
| 409 | STATE_CONFLICT | state change not allowed (T20) |
| 409 | KEY_REUSED | key already used with other content |
| 410 | QUOTE_EXPIRED | price to revalidate (R205) |
| 422 | RULE_REFUSED | business rule not met, e.g. a cap (R304) |
| 429 | TOO_MANY_ATTEMPTS | attempt limit reached, with `Retry-After` |
| 503 | PROVIDER_UNAVAILABLE | outside service down, retry |

## Hardening in S1 and S2
- Separate processes for API, WebSocket, background jobs; a replayed job has no effect (T59).
- Sessions in Redis, stateless app (T59).
- RLS in PostgreSQL; with PgBouncer the identity must stay in the transaction: `SET LOCAL`, and a test with two merchants in parallel (T55).
- Separate DB users with minimal rights; the app cannot modify the audit log; dedicated migrations user, same rights in tests (T56).
- Back-office behind VPN and 2FA (T60).

## Not in the cahier (still open)
- Exact rate limit numbers, pagination style, session cookie and CSRF details, parcel limits beyond regles.md: these are lead or Helmi decisions, not invented.

