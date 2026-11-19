#!/usr/bin/env bash
# Which parts of CI a pull request needs (#114). Reads the changed file names on stdin, one per line, and prints
#   code=<true|false>   any job that builds or tests code (lint, typecheck, unit tests, build, api-mode e2e)
#   api=<true|false>    the API integration tests
#   web=<true|false>    the 3 web e2e shards
# Per file the FIRST matching rule applies; the result is the OR over all files. An empty list (a push to main, or a
# diff that could not be read) means everything is true. Plain bash, no dependencies: .github/scripts/changes.test.sh
# tests every rule, and every pattern of a list, with a broken copy that must fail (the `# MUT-` markers below).
# RV-26: the diff must list a rename as both paths (git diff --no-renames, see ci.yml); a path git quotes (spaces,
# non-ASCII) starts with a double quote and runs everything; and a file a test reads is never a "skip" file.
set -uo pipefail

code=false; api=false; web=false; seen=0
while IFS= read -r f || [ -n "$f" ]; do
  [ -n "$f" ] || continue
  seen=1
  case "$f" in
    # A path git quotes (spaces, non-ASCII) cannot be read here: run everything.
    \"*) code=true; api=true; web=true ;; # MUT-quoted
    # Files that tests read (RV-26). The tripwire in changes.test.sh finds new ones.
    docs/spec/*) code=true ;; # MUT-docsspec
    CLAUDE.md) code=true ;; # MUT-claudemd
    infra/data/*) code=true; api=true ;; # MUT-infradata
    # A package's own Markdown (AR-REVIEW.md, READMEs) follows the package rule, so these come before *.md.
    apps/api/*) code=true; api=true ;; # MUT-api
    packages/*) code=true; api=true; web=true ;; # MUT-packages
    docs/*) ;; # MUT-docs
    infra/*) ;; # MUT-infra
    *.md) ;; # MUT-md
    # The shell job, which always runs, lints deploy.yml with actionlint.
    .github/workflows/deploy.yml) ;; # MUT-deploy
    turbo.json) code=true; api=true; web=true ;; # MUT-turbo
    package.json) code=true; api=true; web=true ;; # MUT-pkgjson
    pnpm-lock.yaml) code=true; api=true; web=true ;; # MUT-lock
    pnpm-workspace.yaml) code=true; api=true; web=true ;; # MUT-workspace
    .node-version) code=true; api=true; web=true ;; # MUT-nodever
    # ci.yml, this script and every other workflow.
    .github/*) code=true; api=true; web=true ;; # MUT-github
    *) code=true; web=true ;; # MUT-other
  esac
done
if [ "$seen" = 0 ]; then code=true; api=true; web=true; fi # MUT-empty

printf 'code=%s\napi=%s\nweb=%s\n' "$code" "$api" "$web"
