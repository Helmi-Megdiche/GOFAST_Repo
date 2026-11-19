# FastGo review rules

How FastGo PRs are reviewed. Every mistake a review finds becomes a rule here, so each review checks more than the last one. The author reads this file before pushing. The reviewer checks every rule that applies to the diff.

Rule IDs start with `RV-` so they never clash with the cahier's rules (R101 and so on).

## The loop

The author is Claude Code (Sonnet 5.5), the junior engineer. The reviewer is the Claude session Helmi brings the output to (Opus 5.5), the supervisor. Helmi carries the messages and merges.

- The supervisor's findings and instructions bind the author. If the author disagrees, it says so in its reply with evidence (file, line, command output) and waits. It does not skip a finding or fix it another way on its own. Helmi settles a disagreement.
- The supervisor may read and change the local copy (`C:\dev\FastGo_Repo`) until the project ends. Before each task the author runs `git status` and does not overwrite or discard a change it did not make.

**One round** is one review of the pushed code, then one author reply with fixes.

**The cap is 3 rounds per PR.** Changed by Helmi on 19 Nov 2026 to save time (A, B, C below).

### A. Only Blocking opens a new round

- **Round 1:** full review of the PR against `docs/spec/regles.md`, the plan and this file.
- **Blocking** findings must be fixed and open the next round.
- **Should fix:** fixed in the same reply if it takes under about 30 minutes. Otherwise the lead opens a GitHub issue with the label `follow-up`, linked from the PR, and it does not hold the merge. Helmi can still ask for one to block.
- **Minor:** fixed with other fixes or listed in the PR. Never a reason for a round.
- **No Blocking finding in a round:** the lead posts `**Supervisor: final**` in that same comment and lists the quick Should fix and Minor items. The author fixes them in the push that opens the PR. The lead checks them when it checks CI, with no new round.
- **Rounds 2 and 3:** check the Blocking fixes and what they touched. A new area is opened only for a Blocking finding.
- **After round 3:** the reviewer checks only the round 3 fixes and reports to Helmi, with no new prompt for the author. Helmi decides whether to merge, open a follow-up ticket or allow another round.

### B. Review effort by risk

- **High risk:** money, order or parcel states, sign-in, rights, personal data, the API contract, DB grants or migrations. Round 1 is a deep review by a separate Opus reviewer with a fresh context. Fix checks in rounds 2 and 3 are done by the lead alone.
- **Low risk:** UI, text, docs, config, tests only. One light review by the lead or a Sonnet reviewer. With no Blocking finding, the lead posts final straight away.
- **When unsure, treat it as high risk.**

### C. Self-check before every Report

Before pushing, the author goes through every rule in this file that applies to the diff. The Report then starts with:

1. The head commit (full SHA).
2. The real counts of lint, typecheck, unit and integration tests run on that commit, and anything not run (RV-09).
3. A table with one row per rule that applies: rule, pass or fail, how it was checked (command, test name or file and line).

A Report without this block is sent back without using a round. A rule marked pass that the review shows failing is a Blocking finding.

The count starts at the first review after this file was added. Questions from the author, such as a choice between two designs, do not use a round.

## Findings

| Level | Meaning | Effect |
|---|---|---|
| Blocking | Wrong behaviour, a broken rule from `regles.md`, a security or personal data problem, a red check, or a self-check row marked pass that fails | Fixed before merge. Opens the next round |
| Should fix | Works today, but will cause a bug or mislead the next PR | Fixed now if under about 30 minutes, else a `follow-up` issue. Never opens a round on its own |
| Minor | Small cleanup | Fixed with other fixes, or listed in the PR. Never opens a round |

Each finding gives the file and line, how to reproduce it, and the expected result. The reviewer reproduces a finding before reporting it, and does not rely on the author's summary.

## Adding a rule

For each mistake found, in the same round:

1. Add a rule at the end of the list, with the next `RV-` number.
2. Say what to check and how, so the check can actually fail. Name the mistake that caused the rule. Keep it to 2 or 3 lines.
3. If an existing rule already covers the mistake, add the new case to its source line and sharpen the check. Do not add a duplicate.

Writing a rule never delays posting the review. Rules are changed or removed only with Helmi's approval. A rule describes a kind of mistake, so it must be useful beyond the one bug. A fact about one screen belongs in the plan or the PR.

## Rules

### State and business logic

**RV-01. A guard must still hold after the subject moves on.**
For each check on a current state, replay the action with the subject moved to every state it can reach before that action.
Source: PR 0, `noParcelTaken` tested `status === "taken"`. A parcel that was scanned and then moved on made the pickup finish refuse, so the mission stayed open and the order could stay `in_transit`.

**RV-02. Code that matches the plan can still be wrong.**
Test each plan rule and each ruling against the purpose it serves, with real sequences of actions: one parcel, then several parcels at different steps. Read every event written, not only the final state. A test that asserts the result the code gives today proves nothing about the ruling. If the plan is wrong, correct the plan and send the change to Helmi.
Source: PR 0, the `noParcelTaken` bug came from the plan's own wording, and the code followed it. PR 0 round 1: `picked_up → lost` held for one parcel, but with 3 parcels, P1 taken then lost while P2 and P3 were still `to_collect` wrote `picked_up → in_transit → lost`, and the test asserted the `in_transit` event. PR A round 1: the timeline read each failure's reason from the parcel row, so a parcel that failed twice showed the second reason twice. Data shown per event is read from the event.

**RV-03. Declared tables must list every move the code can make.**
Compare the transition tables with the moves that derivation and cascades can produce, and report any pair the table does not list. A derived state must never move backward. Keep a test that walks the parcel table through many sequences on a 2 or 3 parcel order and checks every order event against the order table.
Source: PR 0, `picked_up → lost` was produced by derivation but missing from the order table. PR 0 round 2: the fix for a loss during pickup made a loss after `in_transit` write `in_transit → picked_up`.

**RV-04. Effects meant for internal use must not be reachable directly.**
For each public function, try the inputs that only a cascade should send. They must be refused with nothing changed and no event written.
Source: PR 0, a direct mission end with `endReason` left the order `assigned` with no active mission. PR 0 round 3 check: `recomputeOrder` throws on an unlisted move after the parcel row and its event were already written. Every refusal or throw comes before the first write.

**RV-05. Recheck every earlier choice when its inputs change, and again on submit.**
Change an earlier step, then try to continue and to submit with the old choice. An acceptance (a fee, a price, a box whose text names an amount) carries what was shown, and the server compares it with what applies now; a boolean "accepted" is not enough when more than one thing can be accepted.
Source: PR #5, a service the address no longer offered could still be ordered, end to end. PR A round 1: `acceptedFee: true` sent from a "may apply" dialog cancelled with a certain fee after the driver arrived; the R607 box stayed ticked after the quote, and so its amount, changed.

**RV-14. Every state has a place on each screen that groups states.**
For each list, tile or filter built from a set of states, list the states and check that each one lands where the user expects it, and that none is in no group at all.
Source: PR A round 1, C01 showed "in progress" and "last deliveries" from two state lists, and `pickup_failed` was in neither.

**RV-17. A setting that belongs to a person is keyed by the person, not the account.**
Test it with two members of the same company: a change by one must not reach the other.
Source: PR B round 1, a team member's language choice was saved on the company account and changed the admin's language at sign-in (R902).

**RV-18. After an action that erases personal data, search every stored key for the erased values.**
Use data written through the real flows, not only fixtures, and a scan of every key, never a hand-picked list of tables. Copies kept for technical reasons (fingerprints, idempotency keys, caches, counters) count: either store no readable copy (a hash) or show that they expire.
Source: PR B round 1, closing an account left the sender's name and phone in the order and idempotency fingerprints, which only fixture-based tests missed.

**RV-19. An authorisation check reads the stored account (kind, role, status), never only the fields the client session carries.**
Call the function directly with a session whose fields were changed (a merchant row with a customer session) and with a session of another person: it must refuse and write nothing.
Source: PR B round 1, `closeAccount` closed a merchant row when given a session that said `customer`.

**RV-20. When an account gets a terminal state, every writer scoped by its id refuses it.**
List the writers (search for `accountId` in lib/data), and test each one against a closed account, with nothing written.
Source: PR B round 1, an address could still be saved, and an order or claim created, with the session of a closed account.

**RV-21. RLS writes: a customer or merchant never gets table-level UPDATE or INSERT on a table with status, money, owner or tracking columns.**
Use column grants plus WITH CHECK, or a definer function, and test every protected column as that role: the write is refused (or changes 0 rows) and a read-back shows the data unchanged. A policy that hides a row makes UPDATE a silent no-op, so "no error" proves nothing.
Source: PR 3 round 1, `orders_update` gave the owner table-level UPDATE (status, total, owner), parcels could change after confirmation, and a merchant could insert an order as `confirmed` or a `delivered` status event.

**RV-22. Nothing that cannot be undone happens before the last check, and the database is never the first check.**
For each write path, list the steps that cannot be undone (a phone proof or code spent, an attempt counter moved, an SMS or email sent, a call to TTN or another provider) and every refusal the client's input can reach, including database CHECK, unique, foreign key and trigger errors. Each database check the input can reach has a service check that runs first and answers as the cahier table says: 400 `VALIDATION_FAILED` with the field, or 422 `RULE_REFUSED`. The database check stays as the last line (T56). A step that cannot be undone and is a database write runs in the same transaction as the main write, so a late refusal rolls it back; any other such step comes after the commit. Test each database check with the smallest input that breaks it: the answer is 400 or 422, the proof still works, no SMS is sent, no row is written. A database error that still reaches the client is a 500 `INTERNAL_ERROR` with a `trace_id` and no table or constraint name in the message. This extends RV-04 to the database.
Source: #22 PR 4b-2a round 1, a pickup slot that passed the contract hit a database CHECK (23514) and gave a 500 after the phone proof was spent; a pickup window that had already ended was accepted.

**RV-23. A check on a column that can be NULL says what NULL does.**
In SQL, a CHECK whose result is NULL passes, a policy or WHERE whose result is NULL refuses or drops the row. For every CHECK, policy, trigger condition or WHERE that reads a nullable column, write the NULL case on purpose (`is not distinct from`, `is null or ...`, `is not null and ...`, or make the column `not null`), and add a test that inserts or updates with that column NULL and expects the intended result.
Source: #22 PR 4b-2b round 1, the fee CHECK used `=` on a nullable column, so a row with the fee NULL passed it.

**RV-24. A cleanup removes only what belongs to its target.**
For each delete, show what else the same file, group or path can hold, and test with a second person or item next to the target.
Source: #14 PR 3 round 1, offboard.sh removed a whole sudoers file to remove one user.

### Money and values

**RV-06. Test money parsing at the edges in each language.**
Cover leading zeros, thousands groups and separators in fr, ar and en. Results must be integers in millimes.
Source: PR #5, `0 500` in fr was read as 500 TND.

**RV-15. An amount shown in more than one place comes from one reader.**
When two screens show the same total (an amount due, a balance, a count), both call the same function. Search for every place that shows it and compare the values on one fixture account.
Source: PR C round 1, C01 "À régler" read the return balance only, while C04 summed the unpaid invoices: 0 on C01, 29 DT on C04 for the same account.

**RV-07. A value not in the cahier must be easy to find.**
It goes in `packages/domain/src/order/constants.ts` with a comment giving its source or `unsourced`, in section 9 of the plan and in the questions for FastGo. Search the diff for numbers written directly in the code.
Source: PR 0, the handover code length of 4 digits was hard-coded in `orders.ts`. It comes from the D1 mockup only. PR #73 round 1: a limit repeated as a literal in new catalog text.

### Tests

**RV-08. A test with a fixed date must also fix the clock.**
Run the unit suite with the system date moved at least 30 days ahead. It must stay green.
Source: PR 0, `draft.test.ts` fixed its start date but read the real clock, so `main` went red once the 24 h expiry passed.

**RV-09. A count is only true for the commit and the hour it was run.**
Run the checks yourself on the head commit, and report the commit, the counts and anything not run.
Source: PR 0, 530 passing was reported in the morning, and 529 of 530 passed on the same commit that afternoon.

**RV-10. E2e tests wait for the state they read.**
Never read a computed value without waiting for it. Repeat each new or changed spec, up to 20 times for one that was flaky.
Source: PR #5, a test read the W14 price without waiting and failed 7 times out of 10. PR B round 1: the contact 5 MB test chose a file on a client form before hydration and went red once the header bundle grew. Every e2e action on a client form waits for hydration first.

### Code and documents

**RV-11. When behaviour changes, reread what describes it.**
Search for the changed name in comments, tests and plan text.
Source: PR 0, the `StatusEvent.fromStatus` comment still described mission creation only after order and parcel creation events were added. PR 0 round 1: the fixture user Walid H. had the id `usr-yasmine-user`. PR C round 1: invoices arrived and the C01 "À régler" tile still read only the return balance. PR #73 round 1: comments and the PR text said the spec had no file type rule while reponses-gofast.md line 59 gives it for all attachments.

### The review itself

**RV-12. A check must be able to fail.**
Before trusting a command as evidence, run it on a case known to be bad, or read its output line by line.
When a rule applies to each item of a list, the test loops over the list; one sample item is not a test.
Source: PR 0 review, a line-ending check with `grep "\r$"` matched lines ending in the letter `r`, so its result meant nothing. It was thrown away and not reported. PR #73 round 1: the driver mock tests checked a wrong type only on `licence` and a missing document only on `cin`, so a loop that stopped early would pass. CI e2e speed-up: the W16 test expected no cancel button with `toHaveCount(0)`, which passed only because it ran before the order loaded at 350 ms. A "nothing is shown" check must wait for the loaded state first. Main red after #77: profile.spec.ts compared two screens before the countdown had rendered. A helper that triggers async work waits for its result, not just for the next element.

**RV-13. Text is never assembled from pieces in code.**
Search the diff for literal words, punctuation or spacing between JSX expressions (`:`, `/`, `-`, ` de `). The whole line is one catalog key with parameters. Render the page in ar and en and read the line.
Source: PR 0 round 1, the public tracking parcel line wrote `{t("parcel")} 1 :` with a French space and colon, shown as is in ar and en.

**RV-16. A required mark must also be heard.**
Where the control is not a native input (a file picker, a group), the required state is in the accessible name or in a described text taken from the catalog, and a test reads it from the accessibility tree.
Source: PR #73, the six document groups showed only an aria-hidden star.

**RV-17. A new spec file is checked against every Playwright config.**
Run each config's `--list` and confirm the file runs only where it should.
Source: #20 PR 4a round 1, auth-api.spec.ts would have run in the mock shards.

**RV-18. A "did it work?" check after a lost answer asks the server and matches the subject.**
Never fall back to a local copy, and compare the id or phone the request was about. Same for every write: a double submit guard where a second call with a used proof turns success into failure.
Source: #20 PR 4a round 1, Change A returned the stale copy; the reset form sent two requests.
