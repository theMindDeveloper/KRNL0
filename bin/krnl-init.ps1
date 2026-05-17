# krnl-init.ps1 — KRNL0 PowerShell session init.
#
# Runs after the user's PowerShell profile, before the interactive prompt.
#
# 1) Unload PSReadLine — its line-rewrite behavior produces a visible
#    typing gap on xterm.js + node-pty (e.g. "kr     krnl" when typing
#    "krnl"). Removing the module eliminates the gap at the cost of
#    losing prompt syntax coloring — an acceptable trade for usable
#    typing. Errors are swallowed so a missing/broken PSReadLine never
#    blocks the prompt.
#
# 2) Wrap `claude` so the real binary runs with CWD = $env:KRNL0_CLAUDE_HOME
#    (the project's claude/ folder). Claude Code auto-discovers CLAUDE.md
#    from CWD upward, so this is what lets the in-app Claude pick up
#    claude/CLAUDE.md (krnl CLI reference) without polluting the user's
#    shell location. The user's prompt stays wherever they are; only
#    `claude`'s effective working directory changes for the duration of
#    the invocation.

try {
    Remove-Module -Name PSReadLine -Force -ErrorAction SilentlyContinue
} catch { }

if ($env:KRNL0_CLAUDE_HOME -and (Test-Path -LiteralPath $env:KRNL0_CLAUDE_HOME)) {
    function claude {
        # Resolve the real claude executable (skipping this function).
        #
        # npm-installed claude on Windows drops THREE shims into the npm bin dir:
        #   - claude            (extensionless sh script — Linux/macOS shape)
        #   - claude.cmd        (Windows cmd wrapper)
        #   - claude.ps1        (PowerShell wrapper)
        #
        # `Get-Command -CommandType Application` can return all three. If it
        # picks the extensionless `claude` first, `& $real.Source @args` asks
        # Windows to execute a file with no extension — Windows pops up the
        # "How do you want to open this file?" / "Pick an app" dialog, and
        # the user can never actually invoke claude.
        #
        # Filter to extensions Windows knows how to run directly (.cmd / .exe /
        # .bat) and prefer .cmd because it's the npm canonical shim. Fall back
        # to whatever Get-Command returned if no preferred extension exists.
        $all = @(Get-Command claude -CommandType Application -All -ErrorAction SilentlyContinue)
        $preferred = $all | Where-Object {
            $_.Extension -and $_.Extension.ToLower() -in '.cmd','.exe','.bat'
        }
        $real = ($preferred | Select-Object -First 1)
        if (-not $real) { $real = ($all | Select-Object -First 1) }
        if (-not $real) {
            Write-Error "claude executable not found in PATH"
            return
        }
        Push-Location -LiteralPath $env:KRNL0_CLAUDE_HOME
        try {
            & $real.Source @args
        } finally {
            Pop-Location
        }
    }
}
