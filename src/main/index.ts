/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Public API entry point for this library.
 *
 * This package uses `Disposable` and `Symbol.dispose`.
 *
 * TypeScript consumers currently need a compatible `lib` configuration including `esnext.disposable`.
 *
 * Runtimes without native `Symbol.dispose` need a polyfill before importing this package, for example from the `core-js` package via
 * `core-js/proposals/explicit-resource-management`.
 *
 * @module scope
 */

export { dispose } from "./dispose.ts";
export { ScopeError } from "./error.ts";
export { Scope, createScope, getActiveScope, onDispose } from "./scope.ts";
export { ScopeSlot } from "./slot.ts";
