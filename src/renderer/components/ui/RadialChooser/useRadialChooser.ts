// ADR 0002 — useRadialChooser hook.
// Returns a stable handle that callers use to open/close the radial chooser.
// Communicates with RadialChooserHost via the module-level radialBus singleton.

import { useRef, useCallback } from 'react';
import { radialBus } from './bus';
import type { RadialChooserHandle, RadialChooserOptions, RadialOption } from './types';

const DEFAULT_RADIUS = 88;
const DEFAULT_INNER_RADIUS = 24;
const DEFAULT_WEDGE_GAP = 1;
const MIN_RADIUS = 64;
const MAX_RADIUS = 160;

export function useRadialChooser<T>(options: RadialChooserOptions<T>): RadialChooserHandle<T> {
  // Use ref so callbacks don't go stale.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const open = useCallback(
    (origin: { x: number; y: number }, wedgeOptions: RadialOption<T>[]) => {
      const { radius, innerRadius, wedgeGap, onPick, onCancel } = optionsRef.current;
      const clampedRadius = Math.max(
        MIN_RADIUS,
        Math.min(MAX_RADIUS, radius ?? DEFAULT_RADIUS),
      );
      radialBus.open({
        origin,
        options: wedgeOptions as RadialOption<unknown>[],
        radius: clampedRadius,
        innerRadius: innerRadius ?? DEFAULT_INNER_RADIUS,
        wedgeGap: wedgeGap ?? DEFAULT_WEDGE_GAP,
        hoveredIndex: null,
        onPick: onPick as (value: unknown, option: RadialOption<unknown>) => void,
        onCancel,
      });
    },
    [],
  );

  const close = useCallback(() => {
    if (!radialBus.session) return;
    const { onCancel } = radialBus.session;
    radialBus.close();
    onCancel?.();
  }, []);

  // isOpen is a snapshot at call time — callers check this to guard against
  // re-opening. The handle itself is stable; isOpen is not reactive.
  const handle: RadialChooserHandle<T> = {
    open,
    close,
    get isOpen() {
      return radialBus.session !== null;
    },
  };

  return handle;
}
