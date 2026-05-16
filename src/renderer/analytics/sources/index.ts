// Builtin source registration. Import this once from the app boot path
// (currently via useAnalytics) — it self-registers via the side effect.

import { registerDataSource } from '../registry';
import { taskSource } from './taskSource';
import { habitSource } from './habitSource';
import { pomoSource } from './pomoSource';

let registered = false;

export function registerBuiltinSources(): void {
  if (registered) return;
  registerDataSource(taskSource);
  registerDataSource(habitSource);
  registerDataSource(pomoSource);
  registered = true;
}

export { taskSource, habitSource, pomoSource };
