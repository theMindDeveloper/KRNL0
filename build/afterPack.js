// electron-builder afterPack hook — ad-hoc sign the macOS .app.
//
// Without ANY signature, Apple Silicon (arm64) rejects the app with
// "KRNL0.app is damaged and can't be opened. You should move it to
// the Trash." That happens because all Mach-O binaries on arm64 MUST
// be signed (even with an ad-hoc signature) for the kernel to load
// them. Without our help, electron-builder ships truly-unsigned when
// no Developer ID cert is configured — hence the "damaged" message.
//
// Ad-hoc signing (`codesign --sign -`) attaches a self-referential
// signature with no identity. It costs nothing, requires no Apple
// account, and is enough for arm64 to LAUNCH the app.
//
// What ad-hoc signing does NOT do: bypass Gatekeeper for downloaded
// apps. Users will still see "KRNL0 is from an unidentified developer"
// the first time. The fix is right-click → Open (which whitelists it
// permanently). To remove that warning entirely, the project needs a
// $99/yr Apple Developer Program membership + notarisation step in
// the workflow.
//
// This hook is a no-op on Windows and Linux — only darwin needs it.

const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appFilename = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appFilename);

  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  try {
    // --force : replace any existing signature
    // --deep  : sign every nested binary (Electron Framework, helpers, …)
    // --sign -: ad-hoc identity (the literal dash)
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit',
    });
    console.log('[afterPack] ad-hoc signing complete');
  } catch (err) {
    // Non-fatal — better to ship a truly-unsigned app and have the user
    // see the existing error than to fail the entire build pipeline.
    console.warn('[afterPack] ad-hoc signing failed:', err && err.message);
  }
};
