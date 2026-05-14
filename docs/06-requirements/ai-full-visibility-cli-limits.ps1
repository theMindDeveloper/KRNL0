# ============================================================================
#  KRNL0 — LIMITS / NEGATIVE SCRIPT
#  Probes what the krnl CLI deliberately DOESN'T do or REFUSES to do.
#  Every test here EXPECTS a failure / refusal / stub. Pass = the CLI said no.
#  Self-contained: paste the entire file into a PowerShell window.
# ============================================================================

function k-json { param([Parameter(ValueFromRemainingArguments=$true)]$cmd)
  $raw = & krnl @cmd --json
  if (-not $raw) { return $null }
  return ($raw -join '') | ConvertFrom-Json
}
function section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function expect-refuse {
  param([string]$label, [string[]]$cmd, [string]$mustMatch = $null)
  $raw = & krnl @cmd 2>&1
  $out = ($raw -join "`n").Trim()
  $stubbed = $out -match '\[stub\]'
  $refused = $out -match '(?i)(refusing|ambiguous|no\s+\w+\s+match|unknown command|requires|cannot|reserved|must be)'
  $matchedExpected = ($null -eq $mustMatch) -or ($out -match $mustMatch)
  if (($stubbed -or $refused) -and $matchedExpected) {
    Write-Host ("  [+] EXPECTED REFUSE  " + $label) -ForegroundColor Green
    Write-Host ("       └─ " + $out.Split("`n")[0]) -ForegroundColor DarkGray
    $script:passes++
  } else {
    Write-Host ("  [-] UNEXPECTED       " + $label) -ForegroundColor Red
    Write-Host ("       └─ " + $out.Split("`n")[0]) -ForegroundColor DarkGray
    $script:fails++
  }
}
function note($t) { Write-Host ("  • " + $t) -ForegroundColor DarkGray }
$script:passes = 0
$script:fails = 0

# ── A. Known stubs (documented in implementation report §4) ─────────────────
section "A. Documented stubs"
note "These commands parse but return [stub] parsed: ... — out of scope for #117."
expect-refuse "pomo start (stub)"       @("pomo", "start")
expect-refuse "pomo stop (stub)"        @("pomo", "stop")
expect-refuse "pomo status (stub)"      @("pomo", "status")
expect-refuse "board save (stub)"       @("board", "save")
expect-refuse "board load needs path"   @("board", "load")

# ── B. Mother-node protections ──────────────────────────────────────────────
section "B. Mother-node remove refuses without --force"
note "UI cannot render without mothers — the CLI guards against accidental deletion."
expect-refuse "node remove mother-todo"  @("node", "remove", "mother-todo")  "Refusing"
expect-refuse "node remove mother-pomo"  @("node", "remove", "mother-pomo")  "Refusing"
expect-refuse "node remove mother-habit" @("node", "remove", "mother-habit") "Refusing"

# ── C. Required arguments rejected when missing ─────────────────────────────
section "C. Required arguments enforced"
expect-refuse "task add no text"               @("task", "add")
expect-refuse "task edit no text"              @("task", "edit", "task-xxx")
expect-refuse "task delete no id"              @("task", "delete")
expect-refuse "habit add no name"              @("habit", "add")
expect-refuse "habit color no color"           @("habit", "color", "mother-habit")
expect-refuse "edge add missing endpoints"     @("edge", "add")
expect-refuse "edge add --from but no --to"    @("edge", "add", "--from", "x:y")
expect-refuse "node read no ref"               @("node", "read")
expect-refuse "task chain needs ≥2 refs"       @("task", "chain", "only-one")  "at least 2"

# ── D. Invalid values rejected ──────────────────────────────────────────────
section "D. Invalid values"
expect-refuse "habit color unknown color"       @("habit", "color", "mother-habit", "magenta") "Unknown color"
expect-refuse "habit view unknown view"         @("habit", "view", "decade")                  "Unknown view"
expect-refuse "task duration zero"              @("task", "duration", "task-xxxxxxxx", "0")   "positive"
expect-refuse "task duration negative"          @("task", "duration", "task-xxxxxxxx", "-5")  "positive"
expect-refuse "edge --from missing colon"       @("edge", "add", "--from", "mother-todo",
                                                  "--to", "mother-pomo:start")                 "<nodeRef>:<event>"
expect-refuse "edge --to missing colon"         @("edge", "add", "--from", "mother-todo:done",
                                                  "--to", "mother-pomo")                       "<nodeRef>:<command>"
expect-refuse "node set-position no --x/--y"    @("node", "set-position", "mother-todo")       "--x and --y"

# ── E. Ref-resolution rules ─────────────────────────────────────────────────
section "E. Ref-resolution rules"
expect-refuse "prefix < 4 chars rejected"       @("task", "edit", "ab", "text")          "No task"
expect-refuse "shared prefix is ambiguous"      @("node", "read", "task-")               "Ambiguous"
expect-refuse "no match returns 'No … matching'" @("node", "read", "zzzz-not-here")      "No node"
expect-refuse "unknown habit ref"               @("habit", "color", "zzzz-not-here", "cyan") "No habit matching"
expect-refuse "unknown todo item ref"           @("todo", "check", "zzzz-not-here")      "No todo item"
expect-refuse "edge --from unknown node"        @("edge", "add", "--from", "zzzz-not-here:done",
                                                  "--to", "mother-pomo:start")           "--from node"
expect-refuse "edge --to unknown node"          @("edge", "add", "--from", "mother-todo:done",
                                                  "--to", "zzzz-not-here:start")         "--to node"

# ── F. Commands deliberately not implemented (see report §3.7) ──────────────
section "F. Out-of-scope commands"
note "These were considered and cut after advisor review — see report §3.7."
expect-refuse "node set-state (cut: FSM bypass)"   @("node", "set-state", "mother-todo", '{}')   "Unknown command"
expect-refuse "node set-config (cut)"              @("node", "set-config", "mother-todo", '{}')  "Unknown command"
expect-refuse "node add (cut: kind-specific only)" @("node", "add", "task")                     "Unknown command"
expect-refuse "batch (cut: needs re-entrant load)" @("batch", "--json", "[]")                   "Unknown command"
expect-refuse "per-kind show (cut: redundant)"     @("todo", "show")                            "Unknown command"
expect-refuse "pomo show (cut)"                    @("pomo", "show")                            "Unknown command"
expect-refuse "clock show (cut)"                   @("clock", "show")                           "Unknown command"

# ── G. Mother position is pinned by migration (subtle gotcha) ───────────────
section "G. Mother positions are pinned by migration"
note "set-position on a mother SUCCEEDS but the next load snaps it back."
$beforePos = (k-json node read mother-todo).position
& krnl node set-position mother-todo --x 99999 --y 99999 | Out-Null
$afterPos = (k-json node read mother-todo).position
if ($afterPos.x -eq $beforePos.x -and $afterPos.y -eq $beforePos.y) {
  Write-Host ("  [+] EXPECTED         mother position pinned (still {0},{1})" -f $beforePos.x, $beforePos.y) -ForegroundColor Green
  $script:passes++
} else {
  Write-Host ("  [-] UNEXPECTED       mother moved to {0},{1}" -f $afterPos.x, $afterPos.y) -ForegroundColor Red
  $script:fails++
}

# ── H. Unknown commands surface as "Unknown command" ────────────────────────
section "H. Unknown commands"
expect-refuse "totally bogus"        @("totally-bogus-cmd")                      "Unknown command"
expect-refuse "task xyz unknown sub" @("task", "xyz")                            "Unknown command"
expect-refuse "habit xyz unknown sub" @("habit", "xyz")                          "Unknown command"

# ── I. Renderer-coupled commands ────────────────────────────────────────────
section "I. Renderer-coupled commands (exit 2 when no window)"
note "These only succeed if a krnl0 renderer is open. From an external shell,"
note "they should return exit-code 2 with a 'requires an open renderer' message."
$r = & krnl viewport pan --dx 10 --dy 0 2>&1
Write-Host ("  • viewport pan: " + ($r -join " ").Trim()) -ForegroundColor DarkGray
$r = & krnl undo 2>&1
Write-Host ("  • undo: " + ($r -join " ").Trim()) -ForegroundColor DarkGray
$r = & krnl theme set dark 2>&1
Write-Host ("  • theme set: " + ($r -join " ").Trim()) -ForegroundColor DarkGray
$r = & krnl term clear 2>&1
Write-Host ("  • term clear: " + ($r -join " ").Trim()) -ForegroundColor DarkGray

# ── J. Read-only output discipline ──────────────────────────────────────────
section "J. --json output is bare JSON (no banners, no [stub] prefix)"
$raw = & krnl board show --json
$line = ($raw -join "").Trim()
$startsClean = $line.StartsWith("{") -and $line.EndsWith("}")
$hasStubPrefix = $line -match '\[stub\]'
$hasBanner = $line -match '^(krnl0|board:|nodes:|edges:)'
if ($startsClean -and (-not $hasStubPrefix) -and (-not $hasBanner)) {
  Write-Host "  [+] EXPECTED         board show --json is bare JSON" -ForegroundColor Green
  $script:passes++
} else {
  Write-Host "  [-] UNEXPECTED       board show --json has wrapping" -ForegroundColor Red
  Write-Host ("       └─ first 100 chars: " + $line.Substring(0, [Math]::Min(100, $line.Length))) -ForegroundColor DarkGray
  $script:fails++
}

# Confirm round-trip parses
try {
  $obj = $line | ConvertFrom-Json
  if ($obj.nodes) {
    Write-Host "  [+] EXPECTED         ConvertFrom-Json round-trips" -ForegroundColor Green
    $script:passes++
  }
} catch {
  Write-Host "  [-] UNEXPECTED       ConvertFrom-Json failed: $_" -ForegroundColor Red
  $script:fails++
}

# ── Summary ─────────────────────────────────────────────────────────────────
Write-Host "`n=== LIMITS SUMMARY ===" -ForegroundColor Cyan
Write-Host ("  EXPECTED refusals/stubs hit: {0}" -f $script:passes) -ForegroundColor Green
Write-Host ("  Unexpected outcomes:         {0}" -f $script:fails)  -ForegroundColor (if ($script:fails) {"Red"} else {"Green"})
if ($script:fails -eq 0) {
  Write-Host "  ALL LIMITS BEHAVE AS DOCUMENTED" -ForegroundColor Green
} else {
  Write-Host "  See [-] lines above — those are either bugs or the doc lies." -ForegroundColor Yellow
}
