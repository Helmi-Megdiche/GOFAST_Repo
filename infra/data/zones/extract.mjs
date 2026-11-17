// ONE-TIME extract of the délégation boundaries of the Grand Tunis (D1: Tunis, Ariana, Ben Arous,
// Manouba) from OpenStreetMap. Run by hand when the boundaries must be refreshed:
//
//   node infra/data/zones/extract.mjs                  download from OSM, then write both files
//   node infra/data/zones/extract.mjs --from-geojson   write the migration again from delegations.geojson
//   node infra/data/zones/extract.mjs --refresh-names  read the names again from OSM (Overpass only), keep the
//                                                      boundaries of delegations.geojson, write both files
//
// It writes delegations.geojson (the data) and apps/api/migrations/0009_zones_grand_tunis.sql (the
// migration that loads it into core.zones, so every migrated database has the zones). The app NEVER
// calls OpenStreetMap: only this script does, once, on a developer's machine. A migration already on
// `main` is never edited: a refresh of the boundaries is a NEW migration (copy this generator's output
// under the next number).
//
// Data © OpenStreetMap contributors, ODbL 1.0 (see ATTRIBUTION.md). Overpass gives the list and names
// of the relations (admin_level 5 = délégation in Tunisia); Nominatim gives each boundary already
// assembled, with the full-precision polygon, so two délégations that touch share the same points.
import { readFileSync, writeFileSync } from "node:fs";
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

// Names: OSM gives "Délégation Ariana Ville", "Délégation de Sidi Thabet" and, here and there, invisible
// direction marks. The zone name is the place: no "Délégation (de)" prefix, no hidden character. The Arabic
// name is OSM `name:ar`; the English one is `name:en`, else the French name.
const clean = (s) => s.replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();
const placeName = (s) => clean(s).replace(/^D[ée]l[ée]gation\s+(de\s+|d['’]\s*)?/i, "").trim();
function namesOf(tags) {
  const fr = tags["name:fr"] ?? tags.name;
  if (!fr) return null;
  const name = placeName(fr);
  const ar = tags["name:ar"] ? clean(tags["name:ar"]) : "";
  const en = tags["name:en"] ? placeName(tags["name:en"]) : name;
  return { name, nameAr: ar, nameEn: en || name };
}

const round = (n) => Math.round(n * 1e7) / 1e7;
const roundGeometry = (g) =>
  JSON.parse(JSON.stringify(g), (_k, v) => (typeof v === "number" ? round(v) : v));
const sqlText = (s) => `'${s.replaceAll("'", "''")}'`;

const FROM_GEOJSON = process.argv.includes("--from-geojson");
const REFRESH_NAMES = process.argv.includes("--refresh-names");
const GEOJSON = join(HERE, "delegations.geojson");
const MIGRATION = join(HERE, "../../../apps/api/migrations/0009_zones_grand_tunis.sql");
let features;
let osmTimestamp;

if (FROM_GEOJSON || REFRESH_NAMES) {
  const saved = JSON.parse(readFileSync(GEOJSON, "utf8"));
  features = saved.features;
  osmTimestamp = saved.osm_data_timestamp;
  if (REFRESH_NAMES) {
    const byId = new Map();
    for (const [, iso] of GOVERNORATES) {
      const { timestamp, relations } = await overpass(iso);
      osmTimestamp = osmTimestamp < timestamp ? timestamp : osmTimestamp;
      for (const r of relations) byId.set(r.id, r.tags);
      await sleep(5000);
    }
    for (const f of features) {
      const tags = byId.get(f.properties.osm_relation);
      const n = tags && namesOf(tags);
      if (!n) throw new Error(`Relation ${f.properties.osm_relation} (${f.properties.name}) has no name in OSM`);
      if (!n.nameAr) throw new Error(`Relation ${f.properties.osm_relation} (${n.name}) has no name:ar`);
      f.properties = { name: n.name, name_ar: n.nameAr, name_en: n.nameEn, governorate: f.properties.governorate, osm_relation: f.properties.osm_relation };
    }
    features.sort((a, b) => a.properties.governorate.localeCompare(b.properties.governorate) || a.properties.name.localeCompare(b.properties.name));
    writeFileSync(GEOJSON, JSON.stringify({ type: "FeatureCollection", license: saved.license, osm_data_timestamp: osmTimestamp, features }) + "\n");
  }
} else {
  osmTimestamp = "";
// 1. The relations of each governorate (cheap), checked before any boundary is downloaded.
const listed = [];
for (const [governorate, iso] of GOVERNORATES) {
  const { timestamp, relations } = await overpass(iso);
  osmTimestamp = osmTimestamp < timestamp ? timestamp : osmTimestamp;
  for (const r of relations)
    listed.push({ governorate, id: r.id, codegeo: r.tags["ref:tn:codegeo"] ?? "", ...(namesOf(r.tags) ?? { name: "", nameAr: "", nameEn: "" }) });
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
features = [];
const geometry = await boundaries(listed.map((r) => r.id));
for (const r of listed) {
  const g = geometry.get(r.id);
  if (!r.name || !g) throw new Error(`Relation ${r.id} has no name or no boundary`);
  if (g.type !== "Polygon" && g.type !== "MultiPolygon")
    throw new Error(`Relation ${r.id} (${r.name}): ${g.type} is not a polygon`);
  if (!r.nameAr) throw new Error(`Relation ${r.id} (${r.name}) has no name:ar`);
  features.push({
    type: "Feature",
    properties: { name: r.name, name_ar: r.nameAr, name_en: r.nameEn, governorate: r.governorate, osm_relation: r.id },
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

}

// The migration: one insert per délégation, all switched on (D1). No begin/commit: the runner wraps a
// migration in one transaction.
const rows = features.map((f) => {
  const geo = JSON.stringify(f.geometry);
  return `insert into core.zones (name, name_ar, name_en, governorate, area, active) values (${sqlText(f.properties.name)}, ${sqlText(f.properties.name_ar)}, ${sqlText(f.properties.name_en)}, ${sqlText(f.properties.governorate)},
  public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(${sqlText(geo)}), 4326)), 3))::public.geography, true);`;
});
writeFileSync(
  MIGRATION,
  `-- Délégations of the Grand Tunis (Tunis, Ariana, Ben Arous, Manouba; decision D1), all switched on.
-- GENERATED by infra/data/zones/extract.mjs: do not edit by hand. Names: the place without "Délégation",
-- Arabic from OSM name:ar, English from name:en else the French name.
-- © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). OSM data of ${osmTimestamp}.
-- The app never calls OpenStreetMap: the boundaries live in core.zones.
${rows.join("\n")}
`,
);
console.log(`${features.length} délégations, OSM data of ${osmTimestamp}`);
