"""Merge (fr, en, ar) tuples into the FastGo catalogs, or remove keys, then regenerate AR-REVIEW.md."""
import json, runpy, subprocess, sys
from pathlib import Path

root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
base = root / "packages/i18n/src/messages"
locales = ["fr", "en", "ar"]
catalogs = {loc: json.loads((base / f"{loc}.json").read_text(encoding="utf8")) for loc in locales}

if sys.argv[1] == "--remove":
    for dotted in sys.argv[2:]:
        for data in catalogs.values():
            *path, last = dotted.split(".")
            node = data
            for part in path:
                node = node[part]
            node.pop(last, None)
else:
    tree = runpy.run_path(sys.argv[1])["T"]
    for i, loc in enumerate(locales):
        def merge(dst, src):
            for key, value in src.items():
                if isinstance(value, dict):
                    merge(dst.setdefault(key, {}), value)
                else:
                    dst[key] = value[i]
        merge(catalogs[loc], tree)

for loc, data in catalogs.items():
    (base / f"{loc}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
subprocess.run(["pnpm", "--filter", "@fastgo/i18n", "ar-review"], cwd=root, check=True, stdout=subprocess.DEVNULL)
print("catalogs updated, AR-REVIEW.md regenerated")
