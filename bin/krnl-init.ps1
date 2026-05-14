# krnl-init.ps1 — KRNL0 PowerShell session init.
#
# Runs after the user's PowerShell profile loads, before the interactive
# prompt. Configures PSReadLine to play nicely with xterm.js + node-pty.
#
# What we change:
#   - PredictionSource = None : turns off the inline ghost-text suggestion
#     that re-renders the input line on every keystroke. On xterm.js + Windows
#     node-pty, the re-render leaves a visible gap between the first 2 typed
#     characters and the rest of the input. Disabling fixes the visual.
#
# What we keep:
#   - PSReadLine itself stays loaded, so syntax coloring, tab completion,
#     arrow-key history, and Clear-Host (cls) all behave normally.
#
# Errors are silenced so an older PSReadLine (or no PSReadLine at all) does
# not break the session.

if (Get-Module -Name PSReadLine -ErrorAction SilentlyContinue) {
    Set-PSReadLineOption -PredictionSource None -ErrorAction SilentlyContinue
}
