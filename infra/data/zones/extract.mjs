// ONE-TIME extract of the délégation boundaries of the Grand Tunis (D1: Tunis, Ariana, Ben Arous,
// Manouba) from OpenStreetMap. Run by hand when the boundaries must be refreshed:
//
//   node infra/data/zones/extract.mjs
//
// It writes delegations.geojson (the data) and delegations.seed.sql (the seed that loads it into
// core.zones). The app NEVER calls OpenStreetMap: only this script does, once, on a developer's machine.
//
// Data © OpenStreetMap contributors, ODbL 1.0 (see ATTRIBUTION.md). Overpass gives the list and names
// of the relations (admin_level 5 = délégation in Tunisia); Nominatim gives each boundary already
// assembled, with the full-precision polygon, so two délégations that touch share the same points.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// ISO 3166-2 codes of the four governorates (D1).
const GOVERNORATES = [
  ["Tunis", "TN-11"],
  ["Ariana", "TN-12"],
  ["Ben Arous", "TN-13"],
  ["Manouba", "TN-14"],
];
// OSM admin levels in Tunisia: 4 governorate, 5 DÉLÉGATION, 6 imada (sector, which repeats names across
// governorates). Checked on the data: level 6 gives "La Marsa Plage", "Mongi Slim"... = sectors.
const LEVEL = 5;
const UA = "gofast-zones-extract/1.0 (one-time boundary extract)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The public servers answer 429, 502, 503 or 504 when busy: wait and try again. */
async function fetchRetry(url, init, label) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (![429, 502, 503, 504].includes(res.status) || attempt === 6) throw new Error(`${label}: ${res.status}`);
    await sleep(attempt * 8000);
  }
}

async function overpass(iso) {
  const query = `[out:json][timeout:90];area["ISO3166-2"="${iso}"]->.a;rel(area.a)["boundary"="administrative"]["admin_level"="${LEVEL}"];out tags;`;
  const res = await fetchRetry(
    "https://overpass-api.de/api/interpreter",
    {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
    },
    `Overpass ${iso}`,
  );
  const json = await res.json();
  return { timestamp: json.osm3s.timestamp_osm_base, relations: json.elements };
}

async function boundaries(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const url =
      "https://nominatim.openstreetmap.org/lookup?format=geojson&polygon_geojson=1&polygon_threshold=0&osm_ids=" +
      batch.map((id) => `R${id}`).join(",");
    const res = await fetchRetry(url, { headers: { "User-Agent": UA } }, "Nominatim");
    const json = await res.json();
    for (const f of json.features) out.set(f.properties.osm_id, f.geometry);
    await sleep(1200); // Nominatim usage policy: at most one request per second
  }
  return out;
}

const round = (n) => Math.round(n * 1e7) / 1e7;
const roundGeometry = (g) =>
  JSON.parse(JSON.stringify(g), (_k, v) => (typeof v === "number" ? round(v) : v));
const sqlText = (s) => `'${s.replaceAll("'", "''")}'`;

// 1. The relations of each governorate (cheap), checked before any boundary is downloaded.
const listed = [];
let osmTimestamp = "";
for (const [governorate, iso] of GOVERNORATES) {
  const { timestamp, relations } = await overpass(iso);
  osmTimestamp = osmTimestamp < timestamp ? timestamp : osmTimestamp;
  for (const r of relations)
    listed.push({ governorate, id: r.id, codegeo: r.tags["ref:tn:codegeo"] ?? "", name: r.tags["name:fr"] ?? r.tags.name, nameAr: r.tags["name:ar"] ?? null });
  await sleep(5000);
}
const count = new Map();
for (const r of listed) count.set(r.name, (count.get(r.name) ?? 0) + 1);
const dup = listed.filter((r) => count.get(r.name) > 1);
if (dup.length > 0) {
  console.error("Duplicate délégation names (core.zones.name is unique):");
  for (const r of dup.sort((x, y) => x.name.localeCompare(y.name)))
    console.error(`  ${r.name} | ${r.governorate} | relation ${r.id} | codegeo ${r.codegeo}`);
  throw new Error("Resolve the duplicates before loading");
}

// 2. The boundaries.
const features = [];
const geometry = await boundaries(listed.map((r) => r.id));
for (const r of listed) {
  const g = geometry.get(r.id);
  if (!r.name || !g) throw new Error(`Relation ${r.id} has no name or no boundary`);
  if (g.type !== "Polygon" && g.type !== "MultiPolygon")
    throw new Error(`Relation ${r.id} (${r.name}): ${g.type} is not a polygon`);
  features.push({
    type: "Feature",
    properties: { name: r.name, name_ar: r.nameAr, governorate: r.governorate, osm_relation: r.id },
    geometry: roundGeometry(g),
  });
}
features.sort((a, b) => a.properties.governorate.localeCompare(b.properties.governorate) || a.properties.name.localeCompare(b.properties.name));

const collection = {
  type: "FeatureCollection",
  license: "© OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright",
  osm_data_timestamp: osmTimestamp,
  features,
};
writeFileSync(join(HERE, "delegations.geojson"), JSON.stringify(collection) + "\n");

// The seed: idempotent, all délégations switched on the first time (D1). A later run refreshes the
// boundary and the governorate only: it never switches a paused délégation back on.
const rows = features.map((f) => {
  const geo = JSON.stringify(f.geometry);
  return `insert into core.zones (name, governorate, area, active) values (${sqlText(f.properties.name)}, ${sqlText(f.properties.governorate)},
  public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(${sqlText(geo)}), 4326)), 3))::public.geography, true)
  on conflict (name) do update set governorate = excluded.governorate, area = excluded.area;`;
});
writeFileSync(
  join(HERE, "delegations.seed.sql"),
  `-- Délégations of the Grand Tunis (Tunis, Ariana, Ben Arous, Manouba), generated by extract.mjs.
-- © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). OSM data of ${osmTimestamp}.
-- Run as fastgo_migrator, after migration 0008: psql "$DATABASE_MIGRATOR_URL" -f delegations.seed.sql
begin;
${rows.join("\n")}
commit;
`,
);
console.log(`${features.length} délégations, OSM data of ${osmTimestamp}`);
