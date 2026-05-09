#!/usr/bin/env node
import { SysFacade } from './SysFacade';

const facade = new SysFacade();

facade.run(process.argv.slice(2))
  .then((result) => {
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.message ?? JSON.stringify(result));
    }
    process.exit(result.ok ? 0 : 1);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (process.argv.includes('--json')) {
      console.error(JSON.stringify({ ok: false, message: msg }));
    } else {
      console.error(`error: ${msg}`);
    }
    process.exit(1);
  });
