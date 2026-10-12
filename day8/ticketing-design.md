# TicketHub - Design Document

## 1. Requirements

**Functional**

- Browse and search events.
- See which seats are available for an event.
- Hold seats for 10 minutes while paying.
- Pay and receive tickets; view my tickets.

**Non-functional**

- A seat must NEVER be sold twice (correctness comes first).
- Survive big sales: ~3,300 requests/second for 10 minutes.
- Pages load in under 1 second on normal days.
- Fairness: people who arrive first get the first chance to buy.

## 2. Estimates

- Normal: 50,000 visitors × 10 pages = 500,000/day ≈ 5 requests/s.
- Big sale: 200,000 people × ~10 requests in 600 s ≈ 3,300 requests/s.
- Only 20,000 seats exist, so at most 20,000 orders can succeed;
  180,000 people will not get a ticket and must be told quickly.

## 3. API

```text
GET  /events?search=&city=      list and search events (200)
GET  /events/{id}               event details (200)
GET  /events/{id}/seats         seats with their status (200)
POST /holds                     body: { "eventId": 7, "seatIds": [101, 102] }
                                → 201 with holdId and expiry time,
                                → 409 Conflict if a seat is taken
POST /orders                    body: { "holdId": 55, "paymentToken": "..." }
                                → 201 Created (tickets issued)
GET  /me/tickets                my tickets (200)
```

409 Conflict means the request clashes with the current state
(the seat is no longer available).

## 4. Data model

```text
users       (id, name, email UNIQUE, password_hash)
events      (id, name, venue, starts_at)
seats       (id, event_id FK → events, section, row, number,
             status: 'available' | 'held' | 'sold',
             hold_id, hold_expires_at,
             UNIQUE (event_id, section, row, number))
orders      (id, user_id FK → users, event_id FK → events,
             total, status, created_at)
order_seats (order_id FK → orders, seat_id FK → seats UNIQUE)
```

Relationships: an event has many seats (one-to-many); a user has many
orders (one-to-many); an order contains many seats, and each seat can
belong to at most one order - enforced by UNIQUE on order_seats.seat_id.

## 5. Preventing double-booking

Holding a seat uses a single conditional update inside a transaction:

```sql
BEGIN TRANSACTION;

UPDATE seats
SET status = 'held', hold_id = 55,
    hold_expires_at = NOW() + INTERVAL '10 minutes'
WHERE id IN (101, 102) AND event_id = 7
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < NOW()));

-- if fewer than 2 rows changed, someone else got a seat first:
ROLLBACK;  -- and reply 409 Conflict
-- otherwise:
COMMIT;    -- and reply 201 Created
```

Because the database checks the status and changes it in one atomic
step, two buyers can never both succeed for the same seat: the second
update finds the seat already 'held' and changes nothing. The UNIQUE
constraint on order_seats.seat_id is a second safety net. Expired holds
become available again automatically, because the WHERE clause treats
them like available seats.

## 6. Architecture

```text
Browser ──> CDN (event pages, images, CSS, JS)
   │
   v
Load balancer ──> Waiting room (virtual queue)
                       │  lets ~2,000 buyers in at a time
                       v
           App servers (auto-scaled for the sale)
             │               │                │
             v               v                v
      Cache (Redis):   Primary DB          Payment provider
      event pages,     (seats, orders -    (external service)
      seat map         all holds and
      (short TTL)      purchases here)
                             │
                             v
                      Read replicas (browsing, search)
                             │
               Queue ──> Workers (ticket emails, PDFs)
```

- CDN: event pages and images are identical for everyone, so they
  are served from the edge during the rush.
- Waiting room: during a big sale, visitors join a virtual queue
  and are let in at a rate the system can handle, in arrival order.
  This protects the database and is fair.
- Load balancer + auto-scaled stateless app servers: extra servers
  are added before a known big sale and removed afterwards.
- Cache: the seat map is cached for a few seconds to absorb millions
  of views; the final check always happens in the database.
- Primary database: the only place seats are held and sold, so the
  transaction guarantees correctness.
- Read replicas: handle browsing and search so the primary can focus
  on holds and orders.
- Queue + workers: ticket emails and PDFs are created in the
  background after payment, keeping checkout fast.

## 7. Trade-offs

1. Correctness over availability for purchases: holds and orders
   always go to the primary database, even if that means some buyers
   wait or see "try again". Selling a seat twice would be far worse.
2. Freshness vs speed for the seat map: the cached map may be a few
   seconds out of date, so a seat that looks free may already be held.
   The buyer then gets a 409 and picks another seat - acceptable,
   because the final check is always correct.
3. Fairness vs simplicity: the waiting room adds complexity, but
   without it the fastest bots and refreshers would win, and the
   spike could overload the system.