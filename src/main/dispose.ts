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

/**
 * Asynchronously disposes the given disposable handle.
 *
 * The asynchronous disposal method is preferred when present. Synchronous disposable handles are supported as a fallback.
 *
 * @param target - The disposable handle to dispose.
 */
export async function disposeAsync(target: AsyncDisposable | Disposable): Promise<void> {
    if (Symbol.asyncDispose in target) {
        await target[Symbol.asyncDispose]();
    } else {
        target[Symbol.dispose]();
    }
}
