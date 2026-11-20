// Where this renderer runs (Decision 51). The web build (vite.web.config.ts)
// defines __KRNL_WEB__; the desktop build and the tests do not, so this is
// false there. Web hides what only the desktop can do: the terminal, the
// assistant, the board CLI, the floating timer and app updates.

declare const __KRNL_WEB__: boolean | undefined;

export const IS_WEB: boolean = typeof __KRNL_WEB__ !== 'undefined' && __KRNL_WEB__ === true;
