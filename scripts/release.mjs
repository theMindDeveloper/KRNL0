#!/usr/bin/env node
// The KRNL0 release train (docs/releases/RELEASING.md, server-updates F10).
// One script for any agent or person, so every release updates the app, the
// server's website and the KRNL0 website the same way. Free GitHub only.
//
//   npm run release -- status                 where everything stands
//   npm run release -- prepare patch|minor    release PR (version, CHANGELOG, history; checks)
//   npm run release -- tag                    after the PR is merged: tag main, CI builds the draft
//   npm run release -- check                  the draft has everything (installer, latest.yml, web app)
//   npm run release -- mac                    on an Apple silicon Mac, from the tag: build the .dmg and
//                                             attach it to the draft (the website's Mac download)
//   npm run release -- publish --yes          ONLY after the owner said OK: publish, then start the
//                                             server's follow workflow (its release PR)
//
// It never adds an AI attribution (AGENTS.md rule 1) and never publishes without --yes.

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'theMindDeveloper/KRNL0'
const SERVER = 'theMindDeveloper/krnl0-server'
const isWin = process.platform === 'win32'

const out = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: isWin && cmd === 'npm', ...opts }).trim()
const live = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: isWin && cmd === 'npm' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}
const say = (s = '') => process.stdout.write(`${s}\n`)
const fail = (s) => { process.stderr.write(`release: ${s}\n`); process.exit(1) }
const pkgVersion = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const today = () => new Date().toISOString().slice(0, 10)
const gh = (args) => out('gh', args)
const tryGh = (args) => { try { return gh(args) } catch { return null } }
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** The release build of this tag. GitHub lists it a few seconds after the push, so
 *  ask by the tag's name until it shows: "the newest run" can still be the previous release's. */
function buildOf(tagName, tries = 36) {
  for (let i = 0; i < tries; i++) {
    const id = tryGh(['run', 'list', '-R', REPO, '--workflow', 'release.yml', '--branch', tagName, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId // empty'])
    if (id) return id
    if (i < tries - 1) sleep(5000)
  }
  return null
}

function checkTree() {
  if (out('git', ['status', '--porcelain'])) fail('the working tree has changes. Commit or put them aside first.')
}

function status() {
  const v = pkgVersion()
  const latest = tryGh(['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name']) ?? '?'
  const drafts = tryGh(['api', `repos/${REPO}/releases`, '--jq', '[.[] | select(.draft) | .name] | join(", ")']) ?? ''
  const prs = tryGh(['pr', 'list', '-R', REPO, '--search', 'head:chore/release-', '--json', 'number,title', '--jq', '.[] | "#\\(.number) \\(.title)"']) ?? ''
  const serverWeb = tryGh(['api', `repos/${SERVER}/contents/web-version`, '--jq', '.content'])
  const serverLatest = tryGh(['api', `repos/${SERVER}/releases/latest`, '--jq', '.tag_name']) ?? '?'
  const serverPrs = tryGh(['pr', 'list', '-R', SERVER, '--search', 'head:chore/follow-krnl0-', '--json', 'number,title', '--jq', '.[] | "#\\(.number) \\(.title)"']) ?? ''
  say(`This checkout      ${v}`)
  say(`KRNL0 published    ${latest}`)
  say(`KRNL0 drafts       ${drafts || 'none'}`)
  say(`Release PRs        ${prs || 'none'}`)
  say(`Server published   ${serverLatest}`)
  say(`Server website     ${serverWeb ? Buffer.from(serverWeb, 'base64').toString('utf8').trim() : '?'} (web-version on main)`)
  say(`Server release PRs ${serverPrs || 'none'}`)
}

function prepare(kind) {
  if (kind !== 'patch' && kind !== 'minor') fail('prepare patch | prepare minor')
  checkTree()
  out('git', ['fetch', 'origin', 'main', '--tags'])
  const branchBase = 'origin/main'
  const before = JSON.parse(out('git', ['show', `${branchBase}:package.json`])).version
  const [ma, mi, pa] = before.split('.').map(Number)
  const next = kind === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`
  if (out('git', ['tag', '--list', `v${next}`])) fail(`v${next} is already tagged. Never reuse a version.`)
  if (!existsSync(join(ROOT, 'docs', 'releases', `v${next}.md`)) && !out('git', ['ls-tree', '--name-only', branchBase, `docs/releases/v${next}.md`])) {
    fail(`docs/releases/v${next}.md is missing. Write the release notes (designed and approved by the owner, rule 11.5) and merge them first.`)
  }
  if (kind === 'minor') {
    const wn = out('git', ['show', `${branchBase}:src/shared/whatsnew.ts`])
    if (!wn.includes(`minor: '${ma}.${mi + 1}'`)) fail(`What's new has no entry for ${ma}.${mi + 1} (src/shared/whatsnew.ts). Every feature release needs approved notes.`)
  }
  out('git', ['switch', '-c', `chore/release-v${next}`, branchBase])
  out('npm', ['version', kind, '--no-git-tag-version'])
  if (pkgVersion() !== next) fail(`npm made ${pkgVersion()}, expected ${next}`)
  const cl = join(ROOT, 'CHANGELOG.md')
  let changelog = readFileSync(cl, 'utf8')
  if (changelog.includes(`## [${next}] — unreleased`)) changelog = changelog.replace(`## [${next}] — unreleased`, `## [${next}] — ${today()}`)
  else if (!changelog.includes(`## [${next}]`)) fail(`CHANGELOG.md has no [${next}] section. Add it (Added / Fixed) and run again.`)
  writeFileSync(cl, changelog)
  const hist = join(ROOT, 'docs', '08-history', 'HISTORY.md')
  writeFileSync(hist, `${readFileSync(hist, 'utf8').trimEnd()}

## [${today()}] — Release v${next}

**Type:** Release
**PRs/Commits:** release PR on \`chore/release-v${next}\`
**Files changed:** \`package.json\`, \`package-lock.json\`, \`CHANGELOG.md\`, \`docs/08-history/HISTORY.md\`

**Summary:**
- Version \`${before} → ${next}\`. Notes: \`docs/releases/v${next}.md\`.
- After publishing, the server's follow workflow opens the KRNL0 server release that ships this website.

Typecheck clean; all tests pass.
`)
  say('Typecheck and tests (a few minutes)...')
  live('npm', ['run', 'typecheck'])
  live('npm', ['test'])
  out('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md', 'docs/08-history/HISTORY.md'])
  out('git', ['commit', '-m', `chore(release): v${next}`])
  out('git', ['push', '-u', 'origin', `chore/release-v${next}:chore/release-v${next}`])
  const body = `## What changed
- Version ${before} → ${next}; CHANGELOG dated; history entry.
- Release notes: docs/releases/v${next}.md

## Test results
- npm test: PASS
- npm run typecheck: 0 errors

## History entry
- Added to docs/08-history/HISTORY.md`
  say(gh(['pr', 'create', '-R', REPO, '--base', 'main', '--head', `chore/release-v${next}`, '--title', `chore(release): v${next}`, '--body', body]))
  say(`Next: merge the PR, then: npm run release -- tag`)
}

function tag() {
  out('git', ['fetch', 'origin', 'main', '--tags'])
  const v = JSON.parse(out('git', ['show', 'origin/main:package.json'])).version
  if (out('git', ['tag', '--list', `v${v}`])) fail(`v${v} is already tagged.`)
  out('git', ['tag', `v${v}`, 'origin/main'])
  out('git', ['push', 'origin', `v${v}`])
  say(`Tagged v${v}. CI builds the draft (about 6 minutes):`)
  const run = buildOf(`v${v}`)
  if (!run) fail(`no release build started for v${v} within 3 minutes. Look at github.com/${REPO}/actions, then: npm run release -- check`)
  try { live('gh', ['run', 'watch', run, '-R', REPO, '--exit-status']) } catch { fail('the release build failed. Fix it on main, delete the tag (nothing was published), tag again.') }
  say('Next: npm run release -- check')
}

function draftOf(v) {
  const list = JSON.parse(gh(['api', `repos/${REPO}/releases`]))
  return list.find((r) => r.tag_name === `v${v}`) ?? null
}

function check() {
  out('git', ['fetch', 'origin', 'main', '--tags'])
  const v = JSON.parse(out('git', ['show', 'origin/main:package.json'])).version
  const d = draftOf(v)
  if (!d) {
    const tagged = out('git', ['tag', '--list', `v${v}`])
    if (!tagged) fail(`v${v} is not tagged yet. Run: npm run release -- tag`)
    const run = buildOf(`v${v}`, 1)
    const state = run ? tryGh(['run', 'view', run, '-R', REPO, '--json', 'status,conclusion', '--jq', '.status + " " + .conclusion']) : null
    fail(`no draft for v${v} yet. Its build: ${state ?? 'not found'}${run ? ` (gh run watch ${run} -R ${REPO})` : ''}. Run check again when it has finished.`)
  }
  const names = d.assets.map((a) => a.name)
  const want = [`KRNL0-Setup-${v}.exe`, `KRNL0-Setup-${v}.exe.blockmap`, 'latest.yml', `krnl0-web-${v}.tar.gz`, `krnl0-web-${v}.tar.gz.sha256`]
  const missing = want.filter((n) => !names.includes(n))
  if (missing.length) fail(`the draft is missing: ${missing.join(', ')}`)
  const tmp = mkdtempSync(join(tmpdir(), 'krnl0-draft-'))
  try {
    gh(['release', 'download', `v${v}`, '-R', REPO, '-D', tmp, '-p', 'latest.yml', '-p', `krnl0-web-${v}.tar.gz*`])
    const latest = readFileSync(join(tmp, 'latest.yml'), 'utf8')
    if (!latest.includes(`version: ${v}`)) fail(`latest.yml does not say version ${v}`)
    const line = readFileSync(join(tmp, `krnl0-web-${v}.tar.gz.sha256`), 'utf8').trim()
    const [hash, file] = line.split(/\s+/)
    if (file !== `krnl0-web-${v}.tar.gz`) fail(`the .sha256 must name the bare file (the server checks it with sha256sum -c): ${line}`)
    const have = createHash('sha256').update(readFileSync(join(tmp, file))).digest('hex')
    if (have !== hash) fail('the web app does not match its .sha256')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
  say(`v${v} draft: ${d.draft ? 'draft' : 'PUBLISHED'} — installer, blockmap, latest.yml (${v}), web app with a matching checksum.`)
  if (!names.includes(`KRNL0-${v}-arm64.dmg`)) say(`No Mac .dmg yet: on a Mac, git checkout v${v} && npm run release -- mac (before publishing).`)
  say(d.html_url)
  say('Ask the owner for an OK. Then: npm run release -- publish --yes')
}

/** macOS (Apple silicon) .dmg, built on this Mac from the tag and attached to the release.
 *  CI builds Windows only; the website's Mac button finds the .dmg on the release by name. */
function mac() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail('the Mac build runs on an Apple silicon Mac.')
  checkTree()
  out('git', ['fetch', 'origin', 'main', '--tags'])
  const v = JSON.parse(out('git', ['show', 'origin/main:package.json'])).version
  if (!out('git', ['tag', '--list', `v${v}`])) fail(`v${v} is not tagged yet. Run: npm run release -- tag`)
  if (out('git', ['rev-parse', 'HEAD']) !== out('git', ['rev-parse', `v${v}^{commit}`])) fail(`check out the tag first: git checkout v${v}`)
  if (!draftOf(v)) fail(`no release for v${v} yet. Wait for its build: npm run release -- check`)
  // npm 11+ skips dependency install scripts it has not been told to allow:
  // no Electron binary and no node-pty for Electron means a broken app.
  if (!existsSync(join(ROOT, 'node_modules', 'electron', 'dist'))) {
    say('Fetching Electron (npm skipped its install script)...')
    live('node', [join(ROOT, 'node_modules', 'electron', 'install.js')])
  }
  live('npx', ['electron-rebuild', '-f', '-w', 'node-pty'])
  if (!process.env['KRNL0_GOOGLE_CLIENT_ID']) say('Note: KRNL0_GOOGLE_CLIENT_ID is not set here, so this build says Google sign-in is not set up. Export it (and _SECRET) first to include it.')
  rmSync(join(ROOT, 'release'), { recursive: true, force: true })
  live('npm', ['run', 'build'])
  live('npx', ['electron-builder', '--mac', '--arm64', '--publish', 'never'])
  const dmg = join(ROOT, 'release', `KRNL0-${v}-arm64.dmg`)
  if (!existsSync(dmg)) fail(`electron-builder made no ${dmg}`)
  live('codesign', ['--verify', '--deep', '--strict', join(ROOT, 'release', 'mac-arm64', 'KRNL0.app')])
  live('hdiutil', ['verify', dmg])
  live('gh', ['release', 'upload', `v${v}`, '-R', REPO, '--clobber', dmg, `${dmg}.blockmap`])
  say(`Attached KRNL0-${v}-arm64.dmg to v${v}. krnl0.com's Mac button picks it up from the release.`)
}

function publish(yes) {
  if (!yes) fail('publishing ships the update to every install. Only with the owner\'s OK in the moment: npm run release -- publish --yes')
  out('git', ['fetch', 'origin', 'main', '--tags'])
  const v = JSON.parse(out('git', ['show', 'origin/main:package.json'])).version
  const d = draftOf(v)
  if (!d) fail(`no release for v${v}`)
  if (d.draft) gh(['release', 'edit', `v${v}`, '-R', REPO, '--draft=false', '--latest'])
  say(`Published v${v}.`)
  try {
    gh(['workflow', 'run', 'follow-krnl0.yml', '-R', SERVER])
    say(`Started the server's follow workflow: it opens the KRNL0 server release PR that ships KRNL0 ${v}'s website.`)
  } catch {
    say(`Start it by hand: gh workflow run follow-krnl0.yml -R ${SERVER} (it also runs every 6 hours).`)
  }
  say('')
  say('Then, in order:')
  say(`  1. Server: merge its release PR (github.com/${SERVER}/pulls). That tags it and builds the draft.`)
  say('  2. Server: check the draft, get the owner\'s OK, Publish. Updaters and :latest follow.')
  say('  3. Website: bump the fallback version in theminddev-site krnl0/index.html (data-krnl-v, softwareVersion).')
  say('  4. History: a "vX.Y.Z published" entry in docs/08-history/HISTORY.md.')
}

const [cmd, arg] = process.argv.slice(2)
try {
  if (cmd === 'status' || !cmd) status()
  else if (cmd === 'prepare') prepare(arg)
  else if (cmd === 'tag') tag()
  else if (cmd === 'check') check()
  else if (cmd === 'mac') mac()
  else if (cmd === 'publish') publish(process.argv.includes('--yes'))
  else fail('status | prepare patch|minor | tag | check | mac | publish --yes')
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
}
