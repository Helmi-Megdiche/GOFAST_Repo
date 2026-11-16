# Délégation boundaries: data source

The boundaries of the 48 délégations of the Grand Tunis (Tunis, Ariana, Ben Arous, Manouba; decision D1)
in `delegations.geojson` and `delegations.seed.sql` come from OpenStreetMap.

**© OpenStreetMap contributors.** The data is available under the Open Database Licence (ODbL) 1.0:
https://www.openstreetmap.org/copyright

- The extract is one-time (`extract.mjs`, OSM data of the timestamp written in `delegations.geojson`). The
  app never calls OpenStreetMap: it reads the boundaries from its own database (`core.zones`).
- A derived database must stay under ODbL and keep this credit. The public zones page (FE-04, web) shows
  "© OpenStreetMap contributors" with the link above.
- OSM `admin_level` in Tunisia: 4 governorate, 5 délégation (used here), 6 imada (sector, not used).
- Names are the French OSM names (`name:fr`).

## Load

After migration `0008_pricing.sql`, as `fastgo_migrator`:

```
psql "$DATABASE_MIGRATOR_URL" -f infra/data/zones/delegations.seed.sql
```

The seed is idempotent. The first run switches every délégation on (D1). A later run refreshes the boundary
and the governorate only: it never switches a paused délégation back on.

## Refresh

`node infra/data/zones/extract.mjs` (needs the network, takes a few minutes), then review the diff of the two
files and load the seed again.
