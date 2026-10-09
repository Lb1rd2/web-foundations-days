# SnapShare Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- 10,000,000 registered users
- 10% of users are active each day
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- An average photo is 2 MB
- Each photo also gets a 50 KB thumbnail
- 1 day = 86,400 seconds
- Peak traffic is 5 times the average

**Daily active users (DAU):** 10,000,000 × 10% = **1,000,000 users per day**

## 2. Estimates

### Uploads per second

- Uploads per day: 1,000,000 × 1 = 1,000,000
- Average: 1,000,000 ÷ 86,400 ≈ **12 uploads per second**
- Peak (5×): about **60 uploads per second**

### Feed views per second

- Feed views per day: 1,000,000 × 50 = 50,000,000
- Average: 50,000,000 ÷ 86,400 ≈ **579 feed views per second**
- Peak (5×): about **2,900 feed views per second**

### Photo storage per year

- Per photo: 2 MB original + 0.05 MB thumbnail = 2.05 MB
- Per day: 1,000,000 × 2.05 MB ≈ 2.05 TB
- Per year: 2.05 TB × 365 ≈ **750 TB per year**
  - Originals: about 730 TB
  - Thumbnails: about 18 TB

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are about 50 million feed views for every 1 million uploads, which is roughly **50 reads for every 1 write**.

What this means for the design:

- Make reads fast and cheap first, using a CDN and a cache.
- Add a read replica so most database reads do not hit the main database.
- Uploads are less frequent, so they can be slower and handled in the background, such as making thumbnails with a queue.
- Scale reads by adding more copies (replicas, cache servers, app servers) rather than making one machine bigger.

## 4. Why photos should not be stored in the database

- **Size:** 750 TB of new photos every year would make the database huge, slow and very expensive.
- **Speed:** databases are built for small, structured rows, not for sending large image files to users.
- **Backups and copies:** every backup and replica would have to copy all the photo data too.
- **No CDN:** a CDN cannot serve photos straight out of a database.

**Instead:** store the photo files in **object storage** (such as Amazon S3). It is cheap, practically unlimited, and keeps many copies for safety. The database stores only small details about each photo (its id, owner, caption, time and the file's address), and the app sends the user a link to the file.

## 5. Architecture diagram

```text
Users (phones and browsers)
   |                         |
   | photo files             | feed and upload requests
   v                         v
[ CDN ]                [ Load balancer ]
   |                         |
   | cache miss              v
   |            [ App server 1 ] [ App server 2 ] [ App server 3 ]
   |                         |
   |         +---------------+-----------------+-------------------+
   |         |               |                 |                   |
   |         v               v                 v                   v
   |     [ Cache ]    [ Database primary ] [ Object storage ]   [ Queue ]
   |                         |                 ^   ^                |
   |                         | copies data     |   |                v
   |                         v                 |   |            [ Worker ]
   |                [ Read replica ]           |   |                |
   |                                           |   +-- worker reads the original,
   |                                           |       saves the thumbnail, and
   +-------------------------------------------+       updates the database
        (CDN fetches photo files from here)
```

How to read it:

- Photo files reach users through the CDN. API requests go through the load balancer to the app servers.
- App servers read from the cache first, then the read replica. They write to the database primary.
- Original photos go to object storage. A thumbnail job goes onto the queue, and the worker handles it.

## 6. Components, one sentence each

- **CDN:** keeps copies of photos and thumbnails close to users around the world, so images load fast and our servers carry less traffic.
- **Load balancer:** spreads incoming requests across many app servers so no single server is overloaded, and it keeps the app running if one server fails.
- **App servers:** run the SnapShare code (login, upload, feed), and can be copied to handle more users.
- **Cache:** keeps popular data, such as recent feed results, in fast memory so most feed views do not need to touch the database.
- **Database (primary):** stores users, follows and photo details reliably, and is the only place where data is written.
- **Read replica:** holds a copy of the database that handles read requests, so the primary is free for writes.
- **Object storage:** holds the large photo files cheaply and safely, so they stay out of the database.
- **Queue:** holds jobs such as "make a thumbnail" so the upload can finish quickly, and no job is lost during a rush.
- **Worker:** takes jobs from the queue and creates the 50 KB thumbnails in the background.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps **Upload**.
2. The request goes through the **load balancer** to one of the **app servers**.
3. The app server checks the user is logged in and checks the file (it must be an image and not too big).
4. The app server saves the original photo (about 2 MB) in **object storage**.
5. The app server saves a row in the **database** with the photo id, owner, file address and a status of "processing".
6. The app server puts a "create thumbnail" job on the **queue**.
7. The app server replies "upload successful" to the user straight away, without waiting for the thumbnail.
8. A **worker** takes the job from the queue, downloads the original from object storage, and creates a 50 KB thumbnail.
9. The worker saves the thumbnail in object storage and updates the database row to "ready".
10. The cache entries for the user's followers' feeds are cleared or updated, so the new photo appears.
11. When followers scroll their feed, the thumbnail is served by the **CDN**.

## 8. Trade-offs

### Cache: speed against fresh data
The cache makes feeds much faster, but it can show slightly old data, such as a photo that appeared a few seconds ago or a deleted photo that is still visible. We accept this because most feeds do not need to be perfectly up to date. Shorter cache times make the data fresher but put more load on the database.

### Read replica: scale against consistency
The replica takes the read load off the primary, but copying takes a small amount of time (replication lag). A user could upload a photo and not see it straight away if their next read goes to a replica that has not caught up. We accept this for feeds, and we can read from the primary right after a user's own upload.

### Queue and worker: fast uploads against delayed thumbnails
Using a queue makes uploads feel instant, but the thumbnail is not ready for a few seconds. We accept this and show a placeholder image until the status is "ready". It also makes the system harder to run, because we must monitor the queue and handle failed jobs.

### CDN: speed against cost
A CDN makes images load quickly and reduces our server load, but it costs money and cached files can be out of date until they expire. For a read-heavy photo app, the speed is worth the cost.