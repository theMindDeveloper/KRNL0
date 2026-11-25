// @vitest-environment jsdom
/**
 * The accent colour (owner, 2026-11-24): any colour instead of the app's green,
 * and a reset to KRNL0 green. Settings → General → Appearance, `krnl theme accent`.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { ACCENT_DEFAULT, accentProblem, accentTokens, loadAccent, parseAccent, saveAccent } from '../../../src/renderer/themes/accent';
import { applyFrameTheme, resetAppliedTokens } from '../../../src/renderer/themes/applyFrameTheme';
import { AccentPicker } from '../../../src/renderer/components/TopBar/AccentPicker';
import { SysParser } from '../../../src/sys/parser';

beforeEach(() => { localStorage.clear(); resetAppliedTokens(); document.documentElement.removeAttribute('style'); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('accent rules', () => {
  it('reads a hex, a short hex or a preset name; anything else is not a colour', () => {
    expect(parseAccent('#6AA8FF')).toBe('#6aa8ff');
    expect(parseAccent('6aa8ff')).toBe('#6aa8ff');
    expect(parseAccent('#abc')).toBe('#aabbcc');
    expect(parseAccent('blue')).toBe('#6aa8ff');
    expect(parseAccent('KRNL0 green')).toBe(ACCENT_DEFAULT);
    expect(parseAccent('banana')).toBeNull();
  });
  it('refuses a colour too dark for the dark text drawn on it', () => {
    expect(accentProblem('#1a1a40')).toMatch(/Too dark/);
    expect(accentProblem('#6aa8ff')).toBeNull();
    expect(accentProblem(ACCENT_DEFAULT)).toBeNull();
  });
  it('text in the accent is a deeper shade on light paper, the accent itself on dark', () => {
    expect(accentTokens('#6aa8ff', 'light')['--acid-ink']).toContain('black');
    expect(accentTokens('#6aa8ff', 'dark')['--acid-ink']).toBe('#6aa8ff');
  });
  it('buttons are left to the style: they follow var(--acid) where the style fills them with it', () => {
    expect(accentTokens('#6aa8ff', 'dark')['--btn-primary-bg']).toBeUndefined();
    expect(accentTokens('#6aa8ff', 'light')['--btn-primary-fg']).toBeUndefined();
    // An accent-filled dark button gets the accent's hover; a dark-filled one keeps its own.
    expect(accentTokens('#6aa8ff', 'dark', { '--btn-primary-bg': 'var(--acid)' })['--btn-primary-bg-hover']).toContain('#6aa8ff');
    expect(accentTokens('#6aa8ff', 'dark', { '--btn-primary-bg': '#141414' })['--btn-primary-bg-hover']).toBeUndefined();
    expect(accentTokens('#6aa8ff', 'light')['--btn-primary-bg-hover']).toBeUndefined();
  });
});

describe('the accent in every style (review, 2026-11-24)', () => {
  it('a dark-only style shown while the app is set to light gets the dark accent (no dark text on dark)', () => {
    localStorage.setItem('krnl0-accent', '#6aa8ff');
    applyFrameTheme('krnl-dock', 'light');
    expect(document.documentElement.style.getPropertyValue('--acid-ink')).toBe('#6aa8ff');
  });
  it('Blueprint keeps its own cream-on-navy buttons', () => {
    localStorage.setItem('krnl0-accent', '#6aa8ff');
    applyFrameTheme('blueprint', 'light');
    expect(document.documentElement.style.getPropertyValue('--btn-primary-fg')).toBe('#f8eed4');
    expect(document.documentElement.style.getPropertyValue('--acid')).toBe('#6aa8ff');
  });
});

describe('saving and applying', () => {
  it('the accent goes on <html> over the style tokens, and reset brings the green back', () => {
    applyFrameTheme('pro', 'dark');
    expect(document.documentElement.style.getPropertyValue('--acid')).toBe('#c9f158');
    expect(saveAccent('#6aa8ff')).toBeNull();
    expect(loadAccent()).toBe('#6aa8ff');
    expect(document.documentElement.style.getPropertyValue('--acid')).toBe('#6aa8ff');
    expect(saveAccent(null)).toBeNull();
    expect(loadAccent()).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--acid')).toBe('#c9f158');
  });
  it('a too-dark colour is not saved', () => {
    expect(saveAccent('#101020')).toMatch(/Too dark/);
    expect(loadAccent()).toBeNull();
  });
});

describe('Settings → Appearance', () => {
  it('a swatch sets it, any colour can be typed, and Reset goes back to KRNL0 green', () => {
    render(<AccentPicker />);
    expect(screen.getByTestId('settings-accent-reset')).toHaveProperty('disabled', true);
    act(() => { fireEvent.click(screen.getByTestId('settings-accent-violet')); });
    expect(loadAccent()).toBe('#b48cff');
    expect(screen.getByTestId('settings-accent-violet').getAttribute('aria-checked')).toBe('true');
    const hex = screen.getByTestId('settings-accent-hex');
    fireEvent.change(hex, { target: { value: '#ff9f5a' } });
    act(() => { fireEvent.keyDown(hex, { key: 'Enter' }); });
    expect(loadAccent()).toBe('#ff9f5a');
    fireEvent.change(hex, { target: { value: '#111111' } });
    act(() => { fireEvent.keyDown(hex, { key: 'Enter' }); });
    expect(screen.getByTestId('settings-accent-error').textContent).toMatch(/Too dark/);
    expect(loadAccent()).toBe('#ff9f5a');
    act(() => { fireEvent.click(screen.getByTestId('settings-accent-reset')); });
    expect(loadAccent()).toBeNull();
  });
  it('CLI: krnl theme accent <colour|reset>', () => {
    expect(SysParser.parse(['theme', 'accent', '#6aa8ff'])).toEqual({ kind: 'theme', sub: 'accent', value: '#6aa8ff' });
    expect(SysParser.parse(['theme', 'accent', 'reset'])).toEqual({ kind: 'theme', sub: 'accent', value: 'reset' });
    // A shell drops "#6aa8ff" (a comment), so the hex without "#" must work.
    expect(parseAccent('6aa8ff')).toBe('#6aa8ff');
  });
});
