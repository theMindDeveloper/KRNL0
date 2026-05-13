/**
 * Type declaration for dev-port.mjs.
 * Vitest (Node environment) imports the JS file directly; this shim provides
 * TypeScript types without requiring the .mjs to be compiled by tsc.
 */
export declare function portFor(rootPath: string): number;
