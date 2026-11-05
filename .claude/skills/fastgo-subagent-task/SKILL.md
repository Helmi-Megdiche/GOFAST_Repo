---
name: fastgo-subagent-task
description: Dispatch and review FastGo implementation work with subagents at low token cost. Use when delegating a group of fixes or a feature slice to an implementer subagent, or a review to a reviewer subagent.
---

# Subagent task loop (cheap version of superpowers:subagent-driven-development)

Hand everything over as files; never paste diffs, plans or logs into prompts.

1. Plan file in `.superpowers/sdd/<plan>.md` (git-ignored). One `## Task N:` per group, plus a `## Global Constraints` section (copy `constraints.md` from this skill and add task-specific rules).
2. Brief: `bash <sdd-skill>/scripts/task-brief <plan> N`, then prepend the Global Constraints to it.
3. Implementer prompt (keep it under 40 lines): where it fits, the brief path ("your requirements"), interfaces from earlier tasks, rulings on ambiguities, the skills to use (systematic-debugging + TDD for bugs), the port it owns for e2e (see fastgo-e2e-fast), the report path, and the reply contract: status, commits, one-line test summary, concerns (under 15 lines).
4. Parallel work: one git worktree per agent (`git worktree add ../wt-X -b <branch> <base>` then `pnpm install --offline`), each with its own e2e port. File ownership written in the prompt; shared files (catalogs, AR-REVIEW.md) integrated by the controller.
5. Review: `bash <sdd-skill>/scripts/review-package <plan> BASE HEAD` and give the reviewer the brief, report and package paths. Reviewer model: sonnet for mid-size diffs, opus for the final whole-branch review. The controller still reads the diff itself (`git diff --stat`, then targeted hunks).
6. Models: opus for multi-file judgment, sonnet for reviews and scoped fixes, haiku for one-file mechanical edits. Always set the model.
7. Ledger: `<workspace>/progress.md`, one line per dispatch, completion and ruling.
