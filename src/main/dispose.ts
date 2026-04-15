/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Disposes the given disposable handle.
 *
 * @param target - The disposable handle to dispose.
 */
export function dispose(target: Disposable): void {
    target[Symbol.dispose]();
}
