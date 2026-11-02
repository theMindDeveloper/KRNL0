// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { TimeField, parseTime } from '../../../src/renderer/components/ui/TimeField';

afterEach(() => cleanup());

describe('TimeField', () => {
  it('parses loose input', () => {
    expect(parseTime('9')).toBe('09:00');
    expect(parseTime('930')).toBe('09:30');
    expect(parseTime('25:00')).toBeNull();
  });

  it('Enter hands the parsed time to the host form, Escape asks it to close', () => {
    const onChange = vi.fn();
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    render(<TimeField testId="tf" value="09:00" onChange={onChange} onEnter={onEnter} onEscape={onEscape} />);
    const input = screen.getByTestId('tf');
    fireEvent.change(input, { target: { value: '1430' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('14:30');
    expect(onEnter).toHaveBeenCalledWith('14:30');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
