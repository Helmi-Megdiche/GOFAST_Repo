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

### Money and values

**RV-06. Test money parsing at the edges in each language.**
Cover leading zeros, thousands groups and separators in fr, ar and en. Results must be integers in millimes.
Source: PR #5, `0 500` in fr was read as 500 TND.

**RV-15. An amount shown in more than one place comes from one reader.**
When two screens show the same total (an amount due, a balance, a count), both call the same function. Search for every place that shows it and compare the values on one fixture account.
Source: PR C round 1, C01 "À régler" read the return balance only, while C04 summed the unpaid invoices: 0 on C01, 29 DT on C04 for the same account.

**RV-07. A value not in the cahier must be easy to find.**
It goes in `lib/order/constants.ts` with a comment giving its source or `unsourced`, in section 9 of the plan and in the questions for FastGo. Search the diff for numbers written directly in the code.
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
