# krnl-init.ps1 — KRNL0 PowerShell session init.
#
# Unloads PSReadLine. Its line-rewrite behavior produces a visible typing
# gap on xterm.js + node-pty (e.g. "kr     krnl" when typing "krnl").
# Unloading the module eliminates the gap at the cost of losing the
# prompt's syntax coloring — an acceptable trade for a usable terminal.
#
# Wrapped in try/catch so a broken / missing PSReadLine never blocks the
# prompt from appearing.

try {
    Remove-Module -Name PSReadLine -Force -ErrorAction SilentlyContinue
} catch { }
