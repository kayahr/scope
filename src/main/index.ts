/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Public API entry point for this library.
 *
 * @module
 */

export { dispose, disposeAsync } from "./dispose.ts";
export { ScopeError } from "./error.ts";
export { Scope, createScope, getActiveScope, getRootScope, onAsyncDispose, onDispose, resetRootScope, resetRootScopeAsync } from "./scope.ts";
export { ScopeSlot } from "./slot.ts";
