# ============================================================================
#  KRNL0 — CAPABILITIES SCRIPT
#  Exercises every "happy path" surface of the krnl CLI.
#  Self-contained: paste the entire file into a PowerShell window.
#  All test artifacts use a unique marker and are cleaned up at the end.
# ============================================================================

function k-json { param([Parameter(ValueFromRemainingArguments=$true)]$cmd)
  $raw = & krnl @cmd --json
  if (-not $raw) { return $null }
  return ($raw -join '') | ConvertFrom-Json
}
function section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function check($cond, $msg) {
  if ($cond) {
    Write-Host ("  [+] " + $msg) -ForegroundColor Green
    $script:passes++
  } else {
    Write-Host ("  [-] " + $msg) -ForegroundColor Red
    $script:fails++
  }
}
$script:passes = 0
$script:fails = 0
$MARK = "[CAP-$(Get-Random -Maximum 99999)]"
Write-Host "Test marker: $MARK"

# ── 1. Bootstrap reads ──────────────────────────────────────────────────────
section "1. Bootstrap reads"
$info = k-json info
check ($info.nodeCount -ge 5)                                          "info reports nodeCount >= 5"
check ($info.motherIds.PSObject.Properties.Count -ge 5)                "info.motherIds lists mothers"
check ($info.byKind.PSObject.Properties.Count -ge 5)                   "info.byKind reports kinds"

$board = k-json board show
check ($null -ne $board.nodes)                                         "board show --json has .nodes"
check ($null -ne $board.edges)                                         "board show --json has .edges"

$summary = k-json board summary
check ($summary.nodes -eq $info.nodeCount)                             "board summary agrees with info"

$settings = k-json settings show
check ($null -ne $settings.boardPath)                                  "settings show returns boardPath"

# ── 2. Every list command supports --json ───────────────────────────────────
section "2. Every list returns parseable JSON"
foreach ($cmd in "task","todo","habit","edge","node") {
  $j = k-json $cmd list
  check ($null -ne $j)                                                 "$cmd list --json parses"
}

# ── 3. Pair creation — Decision 20 invariant 1 ──────────────────────────────
section "3. todo add creates a paired TaskNode + chain edge"
& krnl todo add "$MARK alpha" --tag t1 | Out-Null
& krnl todo add "$MARK beta"  --tag t1 | Out-Null

$items = (k-json todo list) | Where-Object { $_.text -like "$MARK*" }
check ($items.Count -eq 2)                                             "two TodoItems exist"

$linked = $items | Where-Object { $null -ne $_.taskNodeId }
check ($linked.Count -eq 2)                                            "both items have taskNodeId set"

$alphaTaskId = ($items | Where-Object { $_.text -eq "$MARK alpha" }).taskNodeId
$betaTaskId  = ($items | Where-Object { $_.text -eq "$MARK beta"  }).taskNodeId

$alphaTask = (k-json task list) | Where-Object { $_.id -eq $alphaTaskId }
check ($alphaTask.todoItemId -eq ($items | Where-Object { $_.text -eq "$MARK alpha" }).id) "bidirectional back-link set"

$chain = (k-json edge list) | Where-Object {
  $_.from.nodeId -eq $alphaTaskId -and $_.to.nodeId -eq $betaTaskId
}
check ($null -ne $chain)                                               "auto-chain edge alpha → beta exists"
check ($chain.from.event -eq "task.next")                              "chain edge uses task.next"
check ($chain.to.command -eq "task.activate")                          "chain edge targets task.activate"

# ── 4. Prefix and text resolution ───────────────────────────────────────────
section "4. Prefix and text resolution"

# 4a. task subtask via 8-char prefix
$alphaPrefix = $alphaTaskId.Substring(0, 8)
$r = & krnl task subtask $alphaPrefix "$MARK subA"
check ($r -like "*added under task*")                                  "task subtask <8-char-prefix> succeeds"

# 4b. task add --todo accepts TodoItem prefix (the issue #117 §8 fix)
$alphaItemId = ($items | Where-Object { $_.text -eq "$MARK alpha" }).id
$itemPrefix = $alphaItemId.Substring(0, 8)
$r = & krnl task add "$MARK detail" --todo $itemPrefix --duration 45
check ($r -like "*Added task*")                                        "task add --todo <TodoItem prefix> succeeds (#117 §8)"

# 4c. habit color via prefix (the bug fixed in commit 6adfc6f)
& krnl habit add "$MARK habit1" | Out-Null
$h = (k-json habit list) | Where-Object { $_.name -eq "$MARK habit1" }
$hp = $h.id.Substring(0, 8)
$r = & krnl habit color $hp cyan
check ($r -like "*$MARK habit1*cyan*")                                 "habit color <prefix> resolves"

# 4d. task text fallback
$r = & krnl task toggle "$MARK subA"
check ($r -like "*marked*")                                            "task toggle <unique-text> resolves via text"

# 4e. task add via TodoNode prefix
$todoMotherPrefix = "mother-t"   # mother-todo / mother-term both match
$r = & krnl task add "$MARK ambiguousProbe" --todo mother-todo
check ($r -like "*Added task*")                                        "task add --todo with full mother ref works"

# ── 5. task chain ───────────────────────────────────────────────────────────
section "5. task chain"
& krnl task add "$MARK chainA" | Out-Null
& krnl task add "$MARK chainB" | Out-Null
& krnl task add "$MARK chainC" | Out-Null

$cTasks = (k-json task list) | Where-Object { $_.text -like "$MARK chain*" }
$cIds = $cTasks | Sort-Object text | ForEach-Object { $_.id.Substring(0, 12) }
$r = & krnl task chain $cIds[0] $cIds[1] $cIds[2]
check ($r -like "*Chained 3 tasks*")                                   "task chain wires 3 tasks"

$chainEdges = (k-json edge list) | Where-Object {
  $_.from.event -eq "task.next" -and
  ($cTasks.id -contains $_.from.nodeId) -and
  ($cTasks.id -contains $_.to.nodeId)
}
check ($chainEdges.Count -ge 2)                                        "≥2 task.next edges between chain tasks"

# task chain is idempotent — re-running adds 0 edges
$before = (k-json edge list).Count
$r = & krnl task chain $cIds[0] $cIds[1] $cIds[2]
$after = (k-json edge list).Count
check ($before -eq $after)                                             "task chain is idempotent (no duplicate edges)"

# ── 6. Edge CRUD with prefix refs ───────────────────────────────────────────
section "6. Edge CRUD with prefix refs"
$a = $cIds[0]; $b = $cIds[1]
& krnl edge add --from "${a}:custom.event" --to "${b}:custom.cmd" | Out-Null
$ce = (k-json edge list) | Where-Object { $_.from.event -eq "custom.event" }
check ($null -ne $ce)                                                  "edge add wires custom event → command"

$ep = $ce.id.Substring(0, 12)
& krnl edge disable $ep | Out-Null
$d = (k-json edge list) | Where-Object { $_.id -eq $ce.id }
check ($d.enabled -eq $false)                                          "edge disable flips enabled=false"

& krnl edge enable $ep | Out-Null
$e = (k-json edge list) | Where-Object { $_.id -eq $ce.id }
check ($e.enabled -eq $true)                                           "edge enable flips back to true"

& krnl edge remove $ep | Out-Null
$g = (k-json edge list) | Where-Object { $_.id -eq $ce.id }
check ($null -eq $g)                                                   "edge remove deletes the edge"

# ── 7. Cascade delete (Decision 20 invariant 4) ─────────────────────────────
section "7. Cascade delete"
$parentTaskId = $cIds[0]
& krnl task subtask $parentTaskId "$MARK childX" | Out-Null
& krnl task subtask $parentTaskId "$MARK childY" | Out-Null

$before = ((k-json task list) | Where-Object { $_.text -like "$MARK*" }).Count
$r = & krnl task delete $parentTaskId
$after  = ((k-json task list) | Where-Object { $_.text -like "$MARK*" }).Count
check (($before - $after) -ge 3)                                       "task delete removes parent + 2 children"
check ($r -like "*descendant(s) deleted*")                             "delete message reports cascade"

# ── 8. Node read and set-position ───────────────────────────────────────────
section "8. node read + set-position"
$nbid = ($cTasks | Where-Object { $_.text -eq "$MARK chainB" }).id.Substring(0, 12)
$rd = k-json node read $nbid
check ($rd.kind -eq "todo.task")                                       "node read returns full state"
check ($null -ne $rd.incidentEdges)                                    "node read includes incidentEdges"
check ($rd.state.text -eq "$MARK chainB")                              "node read state includes task text"

& krnl node set-position $nbid --x 1234 --y 5678 | Out-Null
$rd2 = k-json node read $nbid
check ($rd2.position.x -eq 1234 -and $rd2.position.y -eq 5678)         "set-position writes on child node"

# ── 9. Habit lifecycle + duplicate disambiguation ───────────────────────────
section "9. Habit lifecycle"
& krnl habit add "$MARK dupName" | Out-Null
& krnl habit add "$MARK dupName" | Out-Null
$dups = (k-json habit list) | Where-Object { $_.name -eq "$MARK dupName" }
check ($dups.Count -eq 2)                                              "two same-named habits coexist"

$nameAttempt = & krnl habit color "$MARK dupName" cyan
check ($nameAttempt -like "*Ambiguous*")                               "name fallback errors on duplicate names"

$p1 = $dups[0].id.Substring(0, 8)
$r = & krnl habit color $p1 cyan
check ($r -like "*cyan*")                                              "id-prefix disambiguates"

$d1 = (k-json habit list) | Where-Object { $_.id -eq $dups[0].id }
$d2 = (k-json habit list) | Where-Object { $_.id -eq $dups[1].id }
check ($d1.color -eq "cyan" -and $d2.color -ne "cyan")                 "only the targeted habit changed"

# ── 10. board summary + stats ───────────────────────────────────────────────
section "10. board summary + stats"
$st = k-json board stats
check ($null -ne $st.nodesByKind)                                      "board stats.nodesByKind"
check ($null -ne $st.edgesByEvent)                                     "board stats.edgesByEvent"
check ($st.edgeCount -ge 0)                                            "board stats.edgeCount is a number"

# ── 11. Help is accurate ────────────────────────────────────────────────────
section "11. Help is accurate"
$h = & krnl help node
check ($h -match "read")                                               "help node mentions 'read'"
check ($h -match "set-position")                                       "help node mentions 'set-position'"
check ($h -notmatch "node add ")                                       "help node does NOT advertise 'add' (it's stubbed)"

$h = & krnl help task
check ($h -match "chain")                                              "help task mentions 'chain'"

$h = & krnl help info
check ($h -match "info \[--json\]")                                    "help info shows usage"

# ── 12. Cleanup ─────────────────────────────────────────────────────────────
section "12. Cleanup"
(k-json task list) | Where-Object { $_.text -like "$MARK*" } | ForEach-Object {
  & krnl task delete $_.id.Substring(0, 12) | Out-Null
}
# todo items linked to deleted tasks were cleaned up via cascade. Any orphan items:
(k-json todo list) | Where-Object { $_.text -like "$MARK*" } | ForEach-Object {
  # no direct todo-item-remove command exists; toggle-done is harmless cleanup signal
  & krnl todo check $_.id.Substring(0, 8) | Out-Null
}
(k-json habit list) | Where-Object { $_.name -like "$MARK*" } | ForEach-Object {
  & krnl habit remove $_.id.Substring(0, 8) | Out-Null
}
$leftoverTasks = ((k-json task list) | Where-Object { $_.text -like "$MARK*" }).Count
$leftoverHabits = ((k-json habit list) | Where-Object { $_.name -like "$MARK*" }).Count
check ($leftoverTasks -eq 0)                                           "all marker tasks cleaned up"
check ($leftoverHabits -eq 0)                                          "all marker habits cleaned up"

# ── Summary ─────────────────────────────────────────────────────────────────
Write-Host "`n=== CAPABILITIES SUMMARY ===" -ForegroundColor Cyan
Write-Host ("  PASS: {0}" -f $script:passes) -ForegroundColor Green
Write-Host ("  FAIL: {0}" -f $script:fails) -ForegroundColor (if ($script:fails) {"Red"} else {"Green"})
if ($script:fails -eq 0) {
  Write-Host "  ALL CAPABILITIES VERIFIED" -ForegroundColor Green
} else {
  Write-Host "  See [-] lines above for failures" -ForegroundColor Yellow
}
