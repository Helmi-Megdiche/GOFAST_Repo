import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderArReview, type Catalog } from "./ar-review.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(root + path, "utf8");

const ar = JSON.parse(read("src/messages/ar.json")) as Catalog;
const fr = JSON.parse(read("src/messages/fr.json")) as Catalog;
const target = root + "AR-REVIEW.md";
const previous = existsSync(target) ? readFileSync(target, "utf8") : "";

writeFileSync(target, renderArReview(ar, fr, previous));
console.log("AR-REVIEW.md updated");
