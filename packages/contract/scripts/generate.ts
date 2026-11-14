import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTypes, GENERATED_FILE } from "../src/generate-types.ts";

const target = fileURLToPath(GENERATED_FILE);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, await generateTypes());
console.log(`wrote ${target}`);
