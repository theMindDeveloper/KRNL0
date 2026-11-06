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
