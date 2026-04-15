/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { ScopeError, throwErrors } from "./error.ts";
import type { ScopeSlot } from "./slot.ts";

/** Currently active scope, or null when no scope is active. */
let activeScope: Scope | null = null;

/**
 * Public scope for lifetime, disposal, and scope-local values.
 *
 * A scope owns disposal callbacks registered while {@link run} executes synchronously and stores local values through scope slots.
 */
export class Scope implements Disposable {
    /** Parent scope currently owning this scope, or null for root or detached scopes. */
    #parent: Scope | null;

    /** Child scopes owned directly by this scope. */
    readonly #children = new Set<Scope>();

    /** Disposal callbacks owned directly by this scope. */
    readonly #cleanups = new Set<() => void>();

    /** Scope-local values stored directly on this scope. */
    readonly #slots = new Map<ScopeSlot<unknown>, unknown>();

    /** Whether this scope already ran its disposal sequence. */
    #disposed = false;

    /**
     * Creates a new scope optionally owned by an explicit parent.
     *
     * @param parent - The explicit parent scope, null for an explicit root scope, or the current active scope when omitted.
     * @throws {@link ScopeError} - When `parent` was already disposed.
     */
    public constructor(parent: Scope | null = activeScope) {
        if (parent?.isDisposed()) {
            throw new ScopeError("Cannot create a child scope under a disposed parent scope");
        }
        this.#parent = parent;
        if (parent != null) {
            parent.#children.add(this);
        }
    }

    /**
     * Returns the current parent scope, or null when this scope currently has no parent.
     *
     * @returns The current parent scope, or null when there is none.
     */
    public getParent(): Scope | null {
        return this.#parent;
    }

    /**
     * Returns whether this scope already ran its disposal sequence.
     *
     * @returns True when this scope was already disposed.
     */
    public isDisposed(): boolean {
        return this.#disposed;
    }

    /** Disposes this scope and all resources currently owned by it. */
    public [Symbol.dispose](): void {
        this.dispose();
    }

    /** Disposes this scope and all resources currently owned by it. */
    public dispose(): void {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        const parent = this.#parent;
        if (parent != null) {
            parent.#children.delete(this);
        }
        const currentChildren = [ ...this.#children ];
        this.#children.clear();
        const currentCleanups = [ ...this.#cleanups ];
        this.#cleanups.clear();
        const errors: unknown[] = [];
        for (const child of currentChildren) {
            try {
                child.dispose();
            } catch (error) {
                errors.push(error);
            }
        }
        for (const cleanup of currentCleanups) {
            try {
                cleanup();
            } catch (error) {
                errors.push(error);
            }
        }
        this.#slots.clear();
        this.#parent = null;
        if (errors.length > 0) {
            throwErrors(errors, "Scope cleanup failed");
        }
    }

    /**
     * Stores one scope-local value on this scope.
     *
     * @param slot  - The slot identifying the stored value.
     * @param value - The value to store.
     * @returns The stored value.
     * @throws {@link ScopeError} - When the scope was already disposed.
     */
    public set<T>(slot: ScopeSlot<T>, value: T): T {
        this.#assertMutable("Cannot write to a disposed scope");
        this.#slots.set(slot as ScopeSlot<unknown>, value);
        return value;
    }

    /**
     * Returns the value stored directly on this scope for the given slot.
     *
     * @param slot - The slot to read.
     * @returns The locally stored value, or undefined when no local value exists.
     */
    public get<T>(slot: ScopeSlot<T>): T | undefined {
        return this.#slots.has(slot as ScopeSlot<unknown>)
            ? this.#slots.get(slot as ScopeSlot<unknown>) as T
            : undefined;
    }

    /**
     * Returns whether this scope stores a local value for the given slot.
     *
     * @param slot - The slot to test.
     * @returns True when this scope has a local value for the slot.
     */
    public has(slot: ScopeSlot<unknown>): boolean {
        return this.#slots.has(slot);
    }

    /**
     * Deletes the value stored directly on this scope for the given slot.
     *
     * @param slot - The slot to delete locally.
     * @returns True when a local value was removed.
     * @throws {@link ScopeError} - When the scope was already disposed.
     */
    public delete(slot: ScopeSlot<unknown>): boolean {
        this.#assertMutable("Cannot delete from a disposed scope");
        return this.#slots.delete(slot);
    }

    /**
     * Returns the nearest value stored for the given slot on this scope or one of its parents.
     *
     * @param slot - The slot to resolve.
     * @returns The nearest stored value, or undefined when no value exists in this scope chain.
     */
    public find<T>(slot: ScopeSlot<T>): T | undefined {
        let current: Scope | null = this;
        while (current != null) {
            if (current.#slots.has(slot as ScopeSlot<unknown>)) {
                return current.#slots.get(slot as ScopeSlot<unknown>) as T;
            }
            current = current.#parent;
        }
        return undefined;
    }

    /**
     * Registers a cleanup callback to run when this scope is disposed.
     *
     * @param cleanup - The cleanup callback to register.
     */
    public onDispose(cleanup: () => void): void {
        if (this.#disposed) {
            cleanup();
        } else {
            this.#cleanups.add(cleanup);
        }
    }

    /**
     * Runs the given callback with this scope active.
     *
     * Only the synchronous execution of the callback belongs to this scope. Work created after an `await` no longer belongs to this
     * scope. If the callback returns a promise, that promise is returned as-is and is not awaited.
     *
     * @param func - The callback to run inside this scope.
     * @returns The value returned by the callback.
     * @throws {@link ScopeError} - When the scope was already disposed.
     */
    public run<T>(func: () => T): T {
        if (this.#disposed) {
            throw new ScopeError("Cannot run in a disposed scope");
        }
        const previousScope = activeScope;
        activeScope = this;
        try {
            return func();
        } finally {
            activeScope = previousScope;
        }
    }

    /**
     * Throws when this scope was already disposed.
     *
     * @param message - The error message.
     */
    #assertMutable(message: string): void {
        if (this.#disposed) {
            throw new ScopeError(message);
        }
    }
}

/**
 * Returns the currently active scope.
 *
 * @returns The active scope or null.
 */
export function getActiveScope(): Scope | null {
    return activeScope;
}

/**
 * Creates a scope.
 *
 * Without an explicit parent, the created scope is owned by the current active scope. When no scope is active, it becomes a root scope.
 *
 * The returned scope can be activated later through {@link Scope.run} and disposed through {@link Scope.dispose} or {@link dispose}.
 *
 * @returns The created scope.
 */
export function createScope(): Scope;

/**
 * Creates a scope with the given explicit parent scope.
 *
 * @param parent - The explicit parent scope, or null for an explicit root scope.
 * @returns The created scope.
 */
export function createScope(parent: Scope | null): Scope;

/**
 * Creates a scope and returns the value produced by the callback.
 *
 * This is shorthand for creating a scope and immediately running the callback inside it. Without an explicit parent, the created scope is
 * owned by the current active scope. When no scope is active, it becomes a root scope.
 *
 * Only the synchronous execution of the callback belongs to this scope. Work created after an `await` no longer belongs to this scope.
 * If the callback returns a promise, that promise is returned as-is and is not awaited.
 *
 * Cleanup callbacks registered while the callback runs belong to this scope and run together when `scope.dispose` is called. Scope-local
 * values written during that time also belong to this scope. Nested scopes are owned the same way.
 *
 * `scope.onDispose` registers additional cleanup callbacks on this scope. Only the synchronous part of the callback belongs to the
 * scope, so work created after an `await` would no longer belong to it.
 *
 * If the callback throws, the created scope is disposed immediately. If scope disposal also fails, the callback error is listed first in
 * the resulting aggregate error.
 *
 * @param func - Uses the scope and receives the scope handle.
 * @returns The value returned by the callback.
 */
export function createScope<T>(func: (scope: Scope) => T): T;

/**
 * Creates a scope under the given explicit parent scope and returns the callback result.
 *
 * @param parent - The explicit parent scope, or null for an explicit root scope.
 * @param func   - Uses the scope and receives the scope handle.
 * @returns The value returned by the callback.
 */
export function createScope<T>(parent: Scope | null, func: (scope: Scope) => T): T;

export function createScope<T>(parentOrFunc?: Scope | null | ((scope: Scope) => T), func?: (scope: Scope) => T): Scope | T {
    const parent = typeof parentOrFunc === "function" ? undefined : parentOrFunc;
    const callback = typeof parentOrFunc === "function" ? parentOrFunc : func;
    const scope = new Scope(parent);
    if (callback == null) {
        return scope;
    }
    try {
        return scope.run(() => callback(scope));
    } catch (error) {
        try {
            scope.dispose();
        } catch (cleanupError) {
            throwErrors([ error, cleanupError ], "Scope callback failed");
        }
        throw error;
    }
}

/**
 * Registers a cleanup callback on the currently active scope, if there is one.
 *
 * @param cleanup - The cleanup callback to register.
 */
export function onDispose(cleanup: () => void): void {
    activeScope?.onDispose(cleanup);
}
