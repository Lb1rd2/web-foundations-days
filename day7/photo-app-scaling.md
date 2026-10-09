# SnapShare - Scaling Plan

## Assumptions

- 10,000,000 registered users, 10% active daily = 1,000,000 daily active users (DAU).
- Each active user uploads 1 photo and views 50 feed pages per day.
- Photo: 2 MB. Thumbnail: 50 KB.
- 1 day ≈ 100,000 seconds.
- Peak = 5 times the average.

## Estimates

- **Uploads:** 1,000,000 per day ÷ 100,000 ≈ 10 per second (peak ≈ 50 per second).
- **Feed views:** 1,000,000 × 50 = 50,000,000 per day ÷ 100,000 ≈ 500 per second (peak ≈ 2,500 per second).
- **Storage:** 1,000,000 × 2.05 MB ≈ 2 TB per day ≈ 750 TB per year.

## Read-heavy or write-heavy?

The system is very read-heavy: about 50 feed views for every upload. So we should make reads cheap (a CDN for images, a cache for feeds, and read replicas) and keep uploads reliable rather than instant.

## Where do the photos go?

Photos must **not** be stored in the database. 750 TB a year of large files would make the database huge, slow and expensive to back up.

Photo files go into **object storage** (such as Amazon S3), which is built for cheap, safe storage of large files. The database stores only each photo's details: its id, owner, caption, time and the file's URL.

## Architecture

```text
 Mobile app / browser
      |                      |
      | photos/thumbnails    | API calls (HTTPS, JSON)
      v                      v
    [ CDN ]          [ Load balancer ]
      |                      |
      | cache miss           v
      |          [ App server 1 ] [ App server 2 ] [ App server 3 ]
      |                      |
      |        +-------------+--------------+----------------+
      |        |             |              |                |
      |        v             v              v                v
      |    [ Cache ]   [ Primary DB ]  [ Object storage ]  [ Queue ]
      |    (feeds)      (metadata)      (photo files)          |
      |                      |               ^   ^             v
      |                      | replicates    |   |      [ Thumbnail worker ]
      |                      v               |   |             |
      |               [ Read replicas ]      |   +-------------+
      |               (feed queries)         |     saves thumbnail, updates DB
      |                                      |
      +--------------------------------------+
        CDN fetches photo files from object storage
```

## Components

- **CDN:** serves photos from servers near the users, so images load fast and our servers are not overloaded by 2,500 feed views per second.
- **Load balancer:** spreads the API traffic across the app servers and stops sending requests to servers that have failed.
- **App servers:** run the SnapShare code for each request, and we add more of them as traffic grows.
- **Cache:** keeps each user's prepared feed in fast memory, so scrolling does not hit the database every time.
- **Primary database:** is the source of truth for users,