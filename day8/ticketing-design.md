# TicketHub Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part framework: requirements, estimates, API, data model, architecture and trade-offs.

## 1. Requirements

### Functional requirements
- Users can sign up and log in.
- Users can browse events and see event details.
- Users can see a seat map showing which seats are free.
- Users can choose seats and hold them for a short time (5 minutes).
- Users can pay for held seats and receive tickets.
- Users can view their orders and tickets.
- A held seat that is not paid for goes back on sale.

### Non-functional requirements
- **Speed:** browsing pages load in under 300 ms, and holding a seat takes under 1 second, even during a big sale.
- **Correctness:** a seat must never be sold to two people. A paid order must always match real tickets.
- **Fairness:** during a big sale, people are served in the order they arrived, and one person or bot cannot grab all the seats.
- **Availability:** the site stays up during the busiest moments, and a failure of one server does not stop sales.
- **Security:** HTTPS everywhere, hashed passwords, and card details handled only by the payment provider, never stored by us.

## 2. Estimates

**Assumptions:** 2,000,000 registered users, 1 day ≈ 100,000 seconds, peak = 5 times the average, and in a big sale each person makes about 10 page requests.

| Measure | Normal day | Big sale (first 10 minutes) |
|---------|-----------|-----------------------------|
| People | 50,000 visitors | 200,000 people |
| Page requests | 50,000 × 10 = 500,000 per day, about **5 per second** (peak 25) | 200,000 × 10 = 2,000,000 in 600 s, about **3,300 per second** |
| Buying attempts | 5,000 tickets per day, about **0.05 per second** (peak 0.25) | 200,000 in 600 s, about **333 per second** |
| Successful sales | 5,000 per day | at most 20,000 in 600 s, about **33 per second** |
| Storage | about 5,000 × 1 KB = 5 MB per day, about 1.8 GB per year | one event: 20,000 seat rows, about 4 MB |

**Comparison:** in a big sale, page requests are about 670 times higher than normal, and buying attempts are over 6,000 times higher. Only 10% of people can succeed (20,000 seats for 200,000 people), so 180,000 people must get a fast "sold out" answer.

**What this means:** normal days are easy for one small server group. The big sale is the real design problem, so we design for about 5,000 requests per second with extra room. The system is **read-heavy** (many people viewing seats), but the writes (holding and buying seats) must be perfectly correct.

## 3. API

Base path: `/api/v1`. Every request sends `Authorization: Bearer <token>`, except browsing events.

| Method | Path | Description | Success status |
|--------|------|-------------|----------------|
| GET | `/events` | List upcoming events (optional `?city=` and `?page=`) | 200 OK |
| GET | `/events/{id}` | Get the details of one event | 200 OK |
| GET | `/events/{id}/seats` | View the seat map with each seat's status | 200 OK |
| POST | `/events/{id}/holds` | Hold chosen seats for 5 minutes | 201 Created |
| DELETE | `/holds/{id}` | Release a hold early | 204 No Content |
| POST | `/orders` | Pay for held seats and create an order | 201 Created |
| GET | `/orders` | View my orders and tickets | 200 OK |

### Example: hold seats

`POST /events/1/holds`

```json
{ "seatIds": [1201, 1202] }
```

Response: `201 Created`

```json
{
  "holdId": "h_88",
  "expiresAt": "2026-10-12T10:05:00Z",
  "seats": [1201, 1202]
}
```

### Example: pay for the held seats

`POST /orders`

```json
{ "holdId": "h_88", "paymentToken": "tok_abc123" }
```

Response: `201 Created`

```json
{
  "orderId": 5001,
  "status": "paid",
  "tickets": [
    { "seatId": 1201, "section": "A", "row": "1", "number": 1 },
    { "seatId": 1202, "section": "A", "row": "1", "number": 2 }
  ]
}
```

### Error codes

| Code | When it happens |
|------|-----------------|
| 400 Bad Request | The request is wrong, for example no seats are chosen |
| 401 Unauthorized | The user is not logged in |
| 404 Not Found | The event or seat does not exist |
| 409 Conflict | A seat is already held or sold by someone else |
| 410 Gone | The hold has expired before payment |
| 429 Too Many Requests | The user is sending requests too fast, or must wait in the queue |

Example error body (409):

```json
{
  "error": {
    "status": 409,
    "code": "SEAT_TAKEN",
    "message": "Seat 1201 is no longer available. Please choose another seat."
  }
}
```

## 4. Data model

### Tables

**users**
- `id` (primary key), `name`, `email` (unique), `password_hash`, `created_at`

**events**
- `id` (primary key), `name`, `venue`, `starts_at`, `on_sale_at`, `total_seats`

**seats** (one row for each seat in each event)
- `id` (primary key)
- `event_id` (foreign key to events)
- `section`, `row_label`, `seat_number`, `price_cents`
- `status` (`available`, `held` or `sold`)
- `held_by` (foreign key to users, empty if not held)
- `hold_expires_at` (empty if not held)
- A unique rule on (`event_id`, `section`, `row_label`, `seat_number`) so the same seat is not listed twice.

**orders**
- `id` (primary key), `user_id` (foreign key to users), `event_id` (foreign key to events), `total_cents`, `status`, `created_at`

**order_items** (the seats inside an order)
- `id` (primary key)
- `order_id` (foreign key to orders)
- `seat_id` (foreign key to seats, **unique**, so a seat can be in only one order)

### Relationships

- **users to orders (one-to-many):** one user can place many orders, and each order belongs to one user.
- **events to seats (one-to-many):** one event has many seats, and each seat belongs to one event.
- **events to orders (one-to-many):** one event has many orders.
- **orders to seats (one-to-many, through `order_items`):** one order can contain many seats, and a seat can be in at most one order. The table `order_items` stores each pair.

### CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  venue       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  on_sale_at  TEXT NOT NULL,
  total_seats INTEGER NOT NULL
);

CREATE TABLE seats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        INTEGER NOT NULL,
  section         TEXT NOT NULL,
  row_label       TEXT NOT NULL,
  seat_number     INTEGER NOT NULL,
  price_cents     INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'held', 'sold')),
  held_by         INTEGER,
  hold_expires_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (held_by)  REFERENCES users(id),
  UNIQUE (event_id, section, row_label, seat_number)
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  event_id    INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'paid',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE order_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  seat_id  INTEGER NOT NULL UNIQUE,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (seat_id)  REFERENCES seats(id)
);

CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_orders_user ON orders(user_id);
```

**Indexes:** `idx_seats_event_status` makes the seat map fast, because it finds the seats of one event by status without reading the whole table. `idx_orders_user` makes "view my tickets" fast.

### How double-booking is prevented

The danger is two people clicking the same seat at the same moment. TicketHub uses four layers of protection.

**1. One atomic "claim" update (the main protection).** The app never reads the seat and then writes it, because two requests could both see "available" at the same time. Instead it sends one update that checks and claims the seat in a single step:

```sql
UPDATE seats
SET status = 'held', held_by = 7, hold_expires_at = datetime('now', '+5 minutes')
WHERE id = 1201
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < datetime('now')));
```

The database locks the seat's row while it runs. The first request changes **1 row** and wins the seat. The second request finds the seat no longer available, changes **0 rows**, and the API replies **409 Conflict**.

**2. A transaction.** Holding several seats, or paying, happens inside `BEGIN ... COMMIT`. If any seat fails, everything is rolled back, so a user never ends up with half an order:

```sql
BEGIN;
-- confirm the seat is still held by this user and the hold has not expired
UPDATE seats SET status = 'sold', hold_expires_at = NULL
WHERE id = 1201 AND status = 'held' AND held_by = 7
  AND hold_expires_at > datetime('now');
-- if 0 rows changed: ROLLBACK and reply 410 Gone
INSERT INTO orders (user_id, event_id, total_cents, status) VALUES (7, 1, 5000, 'paid');
INSERT INTO order_items (order_id, seat_id) VALUES (last_insert_rowid(), 1201);
COMMIT;
```

**3. A constraint as the last safety net.** `order_items.seat_id` is `UNIQUE`. Even if there is a bug in the code, the database refuses to put the same seat into two orders.

**4. Holds that expire.** A hold lasts 5 minutes. If the person does not pay, a background worker (and the check in the claim update) makes the seat available again, so a seat is never stuck forever.

Everything that decides who gets a seat happens in the **primary database**, never in the cache, because a cache can be out of date.

## 5. Architecture

### Diagram

```text
                  Client (browser / phone app)
                               |
                               v
                          [ DNS ]
                               |
            +------------------+--------------------+
            | images, pages, JS, CSS                | API calls
            v                                       v
         [ CDN ]                          [ Waiting room ]
                                      (lets people in at a safe speed)
                                                    |
                                                    v
                                          [ Load balancer ]
                                                    |
                  +----------------------+----------+-----------+
                  v                      v                      v
            [ App server 1 ]      [ App server 2 ]  ...  [ App server N ]
                  |                      |                      |
      +-----------+----------------------+----------------------+---------+
      |                        |                      |                   |
      v                        v                      v                   v
  [ Cache ]          [ Primary database ]         [ Queue ]       [ Payment provider ]
 (event pages,         (seat status, holds,           |            (external service)
  seat map copy)        orders)                       v
                               |                [ Workers ]
                               | copies data    (email tickets, make QR codes,
                               v                 release expired holds)
                       [ Read replicas ]
                       (browsing, "my tickets")
```

### Components, one sentence each

- **Client:** the browser or phone app where people browse events and buy tickets.
- **DNS:** turns the website name into the address of our servers.
- **CDN:** serves images, pages and scripts from servers near the user, so our servers do not handle that traffic.
- **Waiting room:** during a big sale, lets people into the buying pages at a safe speed, in the order they arrived, so the system is not crushed and the sale is fair.
- **Load balancer:** spreads requests across the app servers and stops sending requests to a server that has failed.
- **App servers:** run the API code and are stateless, so we can add many more before a big sale.
- **Cache:** keeps event details and a recent copy of the seat map in fast memory, so most browsing never reaches the database.
- **Primary database:** the one place where seats are held and sold, using transactions and constraints so no seat is sold twice.
- **Read replicas:** copies of the database that answer browsing and "my tickets" queries, so the primary is free for holds and orders.
- **Queue:** holds background jobs, such as sending ticket emails, so the buying request can finish quickly.
- **Workers:** take jobs from the queue and send emails, create QR codes and release expired holds.
- **Payment provider:** an external service that takes the card payment, so we never store card details.

### Buying flow

1. The user waits in the waiting room, then is let in.
2. The user opens the seat map. It comes from the cache and read replica.
3. The user chooses seats. The app server runs the atomic "hold" update on the primary database.
4. If a seat is taken, the user gets "409" and picks another. Otherwise, the user gets a 5-minute hold.
5. The user pays. The app server checks the hold is still valid, then asks the payment provider to take the money.
6. Inside one transaction, the seats become `sold`, and the order and order items are saved.
7. A job goes onto the queue, and a worker emails the tickets.

### How it survives the big sale

- **The waiting room** limits how many people reach the buying pages at once, so 200,000 people do not all hit the database together.
- **The CDN and cache** serve most of the 3,300 requests per second, so the database only gets the important ones.
- **Extra app servers** are started before the sale begins, because the sale time is known in advance.
- **Only the winners write.** Losing a seat is one fast "0 rows changed" answer, and the 180,000 people who do not get a seat are told "sold out" quickly.
- **Queues and workers** keep slow jobs, like emails, out of the buying request.
- **Rate limiting** stops bots and people who refresh constantly, which helps fairness.
- **No single point of failure:** there are many app servers, replicas can take over if the primary fails, and queued jobs are saved until a worker finishes them.

## 6. Trade-offs

1. **Fairness against convenience (waiting room).** The waiting room makes the sale fair and protects the system, but people have to wait before they can even see the seats. We accept the wait, because without it the site would crash and nobody could buy.
2. **Hold time: protection against lost sales.** A 5-minute hold stops two people paying for one seat, but a seat held by someone who never pays is unavailable for a while. A shorter hold frees seats faster but rushes buyers, and a longer hold is kinder but blocks other buyers. We chose 5 minutes.
3. **Cache: speed against fresh data.** The seat map from the cache can be a few seconds old, so a user may click a seat that was just taken and get "409". We accept this because the real check is always done on the primary database, so the stale map can never cause a double sale.
4. **One primary database: correctness against scale.** Sending all holds and sales to one primary makes correctness simple, but it limits how many writes we can handle. This is fine, because only about 33 sales per second can succeed, and the waiting room controls the rest.