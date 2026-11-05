# FastGo review rules

How FastGo PRs are reviewed. Every mistake a review finds becomes a rule here, so each review checks more than the last one. The author reads this file before pushing. The reviewer checks every rule that applies to the diff.

Rule IDs start with `RV-` so they never clash with the cahier's rules (R101 and so on).

## The loop

The author is Claude Code (Sonnet 5.5), the junior engineer. The reviewer is the Claude session Helmi brings the output to (Opus 5.5), the supervisor. Helmi carries the messages and merges.

- The supervisor's findings and instructions bind the author. If the author disagrees, it says so in its reply with evidence (file, line, command output) and waits. It does not skip a finding or fix it another way on its own. Helmi settles a disagreement.
- The supervisor may read and change the local copy (`C:\dev\FastGo_Repo`) until the project ends. Before each task the author runs `git status` and does not overwrite or discard a change it did not make.

**One round** is one review of the pushed code, then one author reply with fixes.

**The cap is 3 rounds per PR.**

- **Round 1:** full review of the PR against `docs/spec/regles.md`, the plan and this file.
- **Rounds 2 and 3:** check the fixes and what they touched. A new area is opened only for a Blocking finding.
- **After round 3:** the reviewer checks only the round 3 fixes and reports to Helmi, with no new prompt for the author. Helmi decides whether to merge, open a follow-up ticket or allow another round.

The count starts at the first review after this file was added. Questions from the author, such as a choice between two designs, do not use a round.

## Findings

| Level | Meaning | Effect |
|---|---|---|
| Blocking | Wrong behaviour, a broken rule from `regles.md`, a security or personal data problem, or a red check | Fixed before merge |
| Should fix | Works today, but will cause a bug or mislead the next PR | Fixed in the next round, or Helmi accepts it |
| Minor | Small cleanup | Fixed with the next round, or listed in the PR. Never the only reason for a new round |

Each finding gives the file and line, how to reproduce it, and the expected result. The reviewer reproduces a finding before reporting it, and does not rely on the author's summary.

## Adding a rule

For each mistake found, in the same round:

1. Add a rule at the end of the list, with the next `RV-` number.
2. Say what to check and how, so the check can actually fail. Name the mistake that caused the rule.
3. If an existing rule already covers the mistake, add the new case to its source line and sharpen the check. Do not add a duplicate.

Rules are changed or removed only with Helmi's approval. A rule describes a kind of mistake, so it must be useful beyond the one bug. A fact about one screen belongs in the plan or the PR.

## Rules

### State and business logic

**RV-01. A guard must still hold after the subject moves on.**
For each check on a current state, replay the action with the subject moved to every state it can reach before that action.
Source: PR 0, `noParcelTaken` tested `status === "taken"`. A parcel that was scanned and then moved on made the pickup finish refuse, so the mission stayed open and the order could stay `in_transit`.

**RV-02. Code that matches the plan can still be wrong.**
Test each plan rule and each ruling against the purpose it serves, with real sequences of actions: one parcel, then several parcels at different steps. Read every event written, not only the final state. A test that asserts the result the code gives today proves nothing about the ruling. If the plan is wrong, correct the plan and send the change to Helmi.
Source: PR 0, the `noParcelTaken` bug came from the plan's own wording, and the code followed it. PR 0 round 1: `picked_up → lost` held for one parcel, but with 3 parcels, P1 taken then lost while P2 and P3 were still `to_collect` wrote `picked_up → in_transit → lost`, and the test asserted the `in_transit` event.

**RV-03. Declared tables must list every move the code can make.**
Compare the transition tables with the moves that derivation and cascades can produce, and report any pair the table does not list. A derived state must never move backward. Keep a test that walks the parcel table through many sequences on a 2 or 3 parcel order and checks every order event against the order table.
Source: PR 0, `picked_up → lost` was produced by derivation but missing from the order table. PR 0 round 2: the fix for a loss during pickup made a loss after `in_transit` write `in_transit → picked_up`.

**RV-04. Effects meant for internal use must not be reachable directly.**
For each public function, try the inputs that only a cascade should send. They must be refused with nothing changed and no event written.
Source: PR 0, a direct mission end with `endReason` left the order `assigned` with no active mission.

**RV-05. Recheck every earlier choice when its inputs change, and again on submit.**
Change an earlier step, then try to continue and to submit with the old choice.
Source: PR #5, a service the address no longer offered could still be ordered, end to end.

### Money and values

**RV-06. Test money parsing at the edges in each language.**
Cover leading zeros, thousands groups and separators in fr, ar and en. Results must be integers in millimes.
Source: PR #5, `0 500` in fr was read as 500 TND.

**RV-07. A value not in the cahier must be easy to find.**
It goes in `lib/order/constants.ts` with a comment giving its source or `unsourced`, in section 9 of the plan and in the questions for FastGo. Search the diff for numbers written directly in the code.
Source: PR 0, the handover code length of 4 digits was hard-coded in `orders.ts`. It comes from the D1 mockup only.

### Tests

**RV-08. A test with a fixed date must also fix the clock.**
Run the unit suite with the system date moved at least 30 days ahead. It must stay green.
Source: PR 0, `draft.test.ts` fixed its start date but read the real clock, so `main` went red once the 24 h expiry passed.

**RV-09. A count is only true for the commit and the hour it was run.**
Run the checks yourself on the head commit, and report the commit, the counts and anything not run.
Source: PR 0, 530 passing was reported in the morning, and 529 of 530 passed on the same commit that afternoon.

**RV-10. E2e tests wait for the state they read.**
Never read a computed value without waiting for it. Repeat each new or changed spec, up to 20 times for one that was flaky.
Source: PR #5, a test read the W14 price without waiting and failed 7 times out of 10.

### Code and documents

**RV-11. When behaviour changes, reread what describes it.**
Search for the changed name in comments, tests and plan text.
Source: PR 0, the `StatusEvent.fromStatus` comment still described mission creation only after order and parcel creation events were added. PR 0 round 1: the fixture user Walid H. had the id `usr-yasmine-user`.

### The review itself

**RV-12. A check must be able to fail.**
Before trusting a command as evidence, run it on a case known to be bad, or read its output line by line.
Source: PR 0 review, a line-ending check with `grep "\r$"` matched lines ending in the letter `r`, so its result meant nothing. It was thrown away and not reported.

**RV-13. Text is never assembled from pieces in code.**
Search the diff for literal words, punctuation or spacing between JSX expressions (`:`, `/`, `-`, ` de `). The whole line is one catalog key with parameters. Render the page in ar and en and read the line.
Source: PR 0 round 1, the public tracking parcel line wrote `{t("parcel")} 1 :` with a French space and colon, shown as is in ar and en.
