# Test Prompt for In-Terminal Claude

Paste the prompt below into Claude inside a TerminalNode. It asks Claude to demonstrate every category of capability and to be **explicit about what it can't do**. Watch the canvas + the chat output as it runs.

After Claude finishes, run `krnl board show --json | ConvertFrom-Json` to verify the artifacts it claims to have created actually exist.

---

## The prompt (copy everything between the `---` markers)

```
You are in-terminal Claude on krnl0. Demonstrate the full krnl CLI surface
on a fresh marker prefix [TEST-CLAUDE]. Do not delete anything you didn't
create. Do not assume capabilities — verify each via the CLI.

Run these in order, and for each, report:
  - the exact krnl command you used
  - whether it succeeded (the stdout / exit observation)
  - if it failed, the precise error and why you think it failed

When you're done, reply with a single one-paragraph summary AND list any
behavior you discovered that contradicts your skills/CLAUDE.md.

== TESTS ==

1. INTROSPECT
   Run `krnl info --json`. Tell me node count, edge count, theme,
   and every mother-node id.

2. READ DISCIPLINE
   Run each of these and confirm each output is bare parseable JSON
   (no banner, no [stub] prefix):
   - krnl board show --json
   - krnl node list --json
   - krnl todo list --json
   - krnl task list --json
   - krnl habit list --json
   - krnl edge list --json

3. PAIR CREATION (Decision 20)
   `krnl todo add "[TEST-CLAUDE] verify-pair" --tag test`
   Then `krnl todo list --json` and confirm the new item has a non-null
   taskNodeId. Then `krnl task list --json` and confirm the TaskNode
   exists with the matching todoItemId back-link.

4. PREFIX RESOLUTION
   Take the 8-char prefix of the TaskNode id from step 3. Run
   `krnl task toggle <prefix>`. Confirm it toggled done.

5. TEXT-FALLBACK RESOLUTION
   Run `krnl task toggle "[TEST-CLAUDE] verify-pair"`.
   It should resolve by text and toggle back to not-done.

6. TASK CHAIN
   Add 3 marker tasks:
   - `krnl task add "[TEST-CLAUDE] chainA"`
   - `krnl task add "[TEST-CLAUDE] chainB"`
   - `krnl task add "[TEST-CLAUDE] chainC"`
   Then get their 12-char prefixes via `krnl task list --json` and run
   `krnl task chain <a> <b> <c>`.
   Confirm `krnl edge list --json` shows the new task.next edges.

7. EDGE CRUD
   Pick two marker task ids. Run:
   - `krnl edge add --from "<a>:custom.evt" --to "<b>:custom.cmd"`
   - `krnl edge list` — confirm the new edge with ✓
   - `krnl edge disable <edge-prefix>` — confirm ✗
   - `krnl edge enable <edge-prefix>` — back to ✓
   - `krnl edge remove <edge-prefix>` — confirm gone

8. NODE READ
   `krnl node read <any-marker-task-prefix> --json`
   Confirm output has state, config, position, and incidentEdges.

9. SAFETY RAIL
   `krnl node remove mother-todo`
   This MUST refuse without --force. Quote the exact error.

10. EDGES TODAY (HONESTY CHECK)
    Read claude/skills/wire-edge.md. Then tell me in your own words
    what edges actually do today vs what wire-edge.md USED to claim.
    Do not paste the file — synthesize.

11. CASCADE DELETE
    Pick the marker task with the most children (chainA if you ran
    task chain). Run `krnl task delete <prefix>` and confirm the
    cascade message reports descendants removed.

12. CLEANUP
    Delete every [TEST-CLAUDE] task you created. Then run
    `krnl task list --json` and `krnl todo list --json` and confirm
    no marker artifacts remain.

13. STUBS
    Run `krnl pomo status`. Quote the exact output. Acknowledge it's
    a known stub per claude/CLAUDE.md.

== FINAL ==

Reply with:
- Summary paragraph (≤ 4 sentences)
- Numbered list of any contradictions between your skills/CLAUDE.md and
  the CLI's actual behavior (if zero, say zero)
- The marker prefix you used so I can verify cleanup
```

---

## How to verify Claude's run

After Claude finishes, you check from a fresh PowerShell window:

```powershell
function k-json { param([Parameter(ValueFromRemainingArguments=$true)]$cmd)
  (& krnl @cmd --json | Out-String) | ConvertFrom-Json
}

# nothing left from Claude's test run:
(k-json task list) | Where-Object { $_.text -like "*TEST-CLAUDE*" }
(k-json todo list) | Where-Object { $_.text -like "*TEST-CLAUDE*" }
# both should return nothing

# the canvas should be back to where it was before Claude started
```

If you see leftover `[TEST-CLAUDE]` artifacts, Claude failed cleanup in step 12. If `node remove mother-todo` succeeded in step 9, the safety rail is broken (a real bug). If Claude's step 10 paragraph still claims edges fire automatically, the skill update didn't propagate.

## What "complete success" looks like

Steps 1–8 all succeed. Step 9 refuses with a message containing "Refusing to remove mother node". Step 10 honestly says edges are visual-only today. Steps 11–12 leave no marker artifacts. Step 13 reports `[stub] parsed:` output and acknowledges the stub.

If Claude reports any contradiction in the "final" section, that's a doc-vs-code gap I need to know about.

## What's deliberately NOT in this prompt

- Pomo full-cycle test (start → break → complete) — CLI `pomo start/stop` are still stubs.
- Image / text node manipulation — out of #117 scope.
- Voice (say/hear) — out of scope.
- Edge auto-firing — explicitly tested in step 10 as a "what it can't do" check.
