# krnl-init.ps1 — KRNL0 PowerShell session init.
#
# Runs after the user's PowerShell profile loads, before the interactive
# prompt. Configures PSReadLine to play nicely with xterm.js + node-pty.
#
# Background
# ----------
# PSReadLine rewrites the input line on every keystroke (for syntax
# coloring, predictions, etc.). On xterm.js + Windows node-pty, that
# rewrite produces a visible gap between the first 2 typed characters
# and the rest of the input ("kr     krnl" when typing "krnl").
#
# Fix path depends on the installed PSReadLine version:
#
#   - PSReadLine >= 2.1.0:  Set -PredictionSource None and keep the
#     module loaded. Syntax coloring still works, typing gap is gone.
#
#   - PSReadLine <  2.1.0:  -PredictionSource doesn't exist (would
#     throw a ParameterBindingException that -ErrorAction can't
#     suppress). Unloading PSReadLine fixes the gap but loses the
#     syntax coloring. Upgrade for the best experience:
#       Install-Module PSReadLine -Force -SkipPublisherCheck
#
# Errors are wrapped in try/catch so a broken / missing PSReadLine
# never blocks the prompt from appearing.

$mod = Get-Module -Name PSReadLine -ErrorAction SilentlyContinue
if ($mod) {
    if ($mod.Version -ge [version]'2.1.0') {
        try {
            Set-PSReadLineOption -PredictionSource None -ErrorAction SilentlyContinue
        } catch { }
    } else {
        try {
            Remove-Module -Name PSReadLine -Force -ErrorAction SilentlyContinue
        } catch { }
    }
}
