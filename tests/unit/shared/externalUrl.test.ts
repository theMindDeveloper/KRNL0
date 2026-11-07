/** Only the project's pages and the feedback mail may open in the browser (app:open-external). */
import { describe, it, expect } from 'vitest';
import { FEEDBACK_EMAIL, isAllowedExternalUrl } from '../../../src/shared/feedback';

describe('isAllowedExternalUrl', () => {
  it('allows the repo, its pages, and the feedback mail', () => {
    expect(isAllowedExternalUrl('https://github.com/theMindDeveloper/KRNL0')).toBe(true);
    expect(isAllowedExternalUrl('https://github.com/theMindDeveloper/KRNL0/issues/new?title=Bug')).toBe(true);
    expect(isAllowedExternalUrl(`mailto:${FEEDBACK_EMAIL}?subject=Hi`)).toBe(true);
  });
  it('refuses look-alikes a prefix check would let through', () => {
    expect(isAllowedExternalUrl('https://github.com/theMindDeveloper/KRNL0-evil')).toBe(false);
    expect(isAllowedExternalUrl('https://github.com.evil.io/theMindDeveloper/KRNL0')).toBe(false);
    expect(isAllowedExternalUrl('https://user@github.com/theMindDeveloper/KRNL0')).toBe(false);
    expect(isAllowedExternalUrl('http://github.com/theMindDeveloper/KRNL0')).toBe(false);
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isAllowedExternalUrl(`mailto:someone@else.com?cc=${FEEDBACK_EMAIL}`)).toBe(false);
    expect(isAllowedExternalUrl(42)).toBe(false);
  });
});

import { diagnosticsText, scrubDiagnosticLine } from '../../../src/shared/feedback';

describe('feedback diagnostics are scrubbed before they go public', () => {
  it('takes the account name out of paths and hides emails', () => {
    expect(scrubDiagnosticLine('ENOENT C:\\Users\\momo\\Documents\\krnl0\\board.json')).toBe('ENOENT ~\\Documents\\krnl0\\board.json');
    expect(scrubDiagnosticLine('at /Users/ana/Library/x.js and /home/bob/.config')).toBe('at ~/Library/x.js and ~/.config');
    expect(scrubDiagnosticLine('sent to someone@example.com')).toBe('sent to <email>');
    // A name with a space is taken out whole, not just its first word.
    expect(scrubDiagnosticLine('ENOENT C:\\Users\\John Smith\\Documents\\board.json')).toBe('ENOENT ~\\Documents\\board.json');
    expect(scrubDiagnosticLine('at /Users/Ana Maria/Library/x.js')).toBe('at ~/Library/x.js');
  });
  it('diagnosticsText uses the scrubbed lines', () => {
    const t = diagnosticsText({ version: '0.11.0', os: 'Windows 11', errors: ['C:/Users/momo/x failed'] });
    expect(t).toContain('~/x failed');
    expect(t).not.toContain('momo');
  });
});
