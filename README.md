# trips

Offline-first Android + web app for logging transport trips (car and city transport) and showing statistics.
Everything is stored on the device (IndexedDB) and works offline; when online it syncs to a private GitHub repo.

## Use

- **Web:** https://sangeraf.github.io/trips/ (installable as a PWA, works offline).
- **Android:** download `trips.apk` from the [latest release](../../releases/tag/latest) and install it.

## Sync setup (once per device)

1. Create a **private** repo, e.g. `trips-data` (empty is fine).
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new):
   - Repository access: *Only select repositories* → `trips-data`
   - Permissions: *Contents* → *Read and write*
   - Set an expiry date.
3. In the app: **Settings → GitHub sync**, fill in owner, repo and token, then *Test connection* and *Sync now*.

The token is stored only on that device. Data is written as `people.json`, `vehicles.json` and `trips/<year>.json`.
Records are merged by id (newest `updatedAt` wins; deletions are kept as tombstones).

## Develop

```sh
npm ci
npm run dev        # http://localhost:5173
npm run lint && npm run typecheck && npm test
npm run android:sync && (cd android && ./gradlew assembleDebug)   # needs JDK 21 + Android SDK
```
