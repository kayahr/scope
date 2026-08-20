/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { ScopeError, throwErrors } from "./error.ts";
import type { ScopeSlot } from "./slot.ts";

/** Synchronous or asynchronous cleanup callback owned by a scope. */
type Cleanup = () => void | PromiseLike<void>;

/** Currently active scope, or null when no scope is active. */
let activeScope: Scope | null = null;

/**
 * Public scope for lifetime, disposal, and scope-local values.
 *
 * A scope owns disposal callbacks registered while {@link run} executes synchronously and stores local values through scope slots.
 */
export abstract class Scope implements AsyncDisposable, Disposable {
    /** Parent scope currently owning this scope, or null when there is none. */
    #parent: Scope | null;

    /** Child scopes owned directly by this scope. */
    readonly #children = new Set<Scope>();

    /** Disposal callbacks owned directly by this scope, mapped to whether they require asynchronous disposal. */
    readonly #cleanups = new Map<Cleanup, boolean>();

    /** Scope-local values stored directly on this scope. */
    readonly #slots = new Map<ScopeSlot<unknown>, unknown>();

    /** Whether disposal of this scope has started. */
    #disposed = false;

    /** Asynchronous disposal operation, or null when asynchronous disposal has not started. */
    #disposePromise: Promise<void> | null = null;

    /**
     * Creates a new scope optionally owned by an explicit parent scope.
     *
     * @param parent - The explicit parent scope, or null when there is none.
     * @throws {@link ScopeError} - When `parent` was already disposed.
     */
    protected constructor(parent: Scope | null) {
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
     * @throws {@link ScopeError} - When the scope was already disposed.
     */
    public getParent(): Scope | null {
        this.#assertNotDisposed();
        return this.#parent;
    }

    /**
     * Returns whether disposal of this scope has started.
     *
     * @returns True when this scope is being disposed or was already disposed.
     */
    public isDisposed(): boolean {
        return this.#disposed;
    }

    /** Disposes this scope and all resources currently owned by it. */
    public [Symbol.dispose](): void {
        this.dispose();
    }

    /** Asynchronously disposes this scope and all resources currently owned by it. */
    public [Symbol.asyncDispose](): Promise<void> {
        return this.disposeAsync();
    }

    /**
     * Disposes this scope and all resources currently owned by it.
     *
     * @throws {@link ScopeError} - When the scope owns asynchronous cleanup and must be disposed through {@link disposeAsync}.
     */
    public dispose(): void {
        if (this.#disposed) {
            return;
        }
        if (this.requiresAsyncDisposal()) {
            throw new ScopeError("Scope requires asynchronous disposal");
        }
        this.#disposed = true;
        try {
            this.clear();
        } finally {
            this.#parent = null;
        }
    }

    /**
     * Asynchronously disposes this scope and all resources currently owned by it.
     *
     * Synchronous and asynchronous cleanup callbacks are run sequentially in registration order. Concurrent calls share the same disposal operation.
     *
     * @returns Promise which resolves when disposal has completed.
     */
    public disposeAsync(): Promise<void> {
        if (this.#disposePromise != null) {
            return this.#disposePromise;
        }
        if (this.#disposed) {
            return Promise.resolve();
        }
        this.#disposed = true;
        return this.#disposePromise = this.#runAsyncDisposal();
    }

    /** Runs asynchronous disposal and detaches this scope from its parent afterwards. */
    async #runAsyncDisposal(): Promise<void> {
        try {
            await this.clearAsync();
        } finally {
            const parent = this.#parent;
            if (parent != null) {
                parent.#children.delete(this);
            }
            this.#parent = null;
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
        this.#assertNotDisposed();
        this.#slots.set(slot, value);
        return value;
    }

    /**
     * Returns the value stored directly on this scope for the given slot.
     *
     * @param slot - The slot to read.
     * @returns The locally stored value, or undefined when no local value exists.
     * @throws {@link ScopeError} - When the scope was already disposed.
     */
    public get<T>(slot: ScopeSlot<T>): T | undefined {
        this.#assertNotDisposed();
        return this.#slots.has(slot)
            ? this.#slots.get(slot) as T
            : undefined;
    }

    /**
     * Returns whether this scope stores a local value for the given slot.
     *
     * @param slot - The slot to test.
     * @returns True when this scope has a local value for the slot.
     * @throws {@link ScopeError} - When the scope was already disposed.
     */
    public has(slot: ScopeSlot<unknown>): boolean {
        this.#assertNotDisposed();
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
        this.#assertNotDisposed();
        return this.#slots.delete(slot);
    }

    /**
     * Returns the nearest value stored for the given slot on this scope or one of its parents.
     *
     * @param slot - The slot to resolve.
     * @returns The nearest stored value, or undefined when no value exists in this scope chain.
     * @throws {@link ScopeError} - When the scope was already disposed.
     */
    public find<T>(slot: ScopeSlot<T>): T | undefined {
        this.#assertNotDisposed();
        let current: Scope | null = this;
        while (current != null) {
            if (current.#slots.has(slot)) {
                return current.#slots.get(slot) as T;
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
            this.#cleanups.set(cleanup, false);
        }
    }

    /**
     * Registers an asynchronous cleanup callback to run when this scope is disposed asynchronously.
     *
     * A scope owning asynchronous cleanup must be disposed through {@link disposeAsync}. When the scope is already disposed, the cleanup runs immediately
     * and the returned promise represents its completion.
     *
     * @param cleanup - The asynchronous cleanup callback to register.
     * @returns Promise which resolves immediately after registration, or after immediate cleanup of an already disposed scope.
     */
    public onAsyncDispose(cleanup: () => PromiseLike<void>): Promise<void> {
        if (this.#disposed) {
            return Promise.resolve(cleanup());
        }
        this.#cleanups.set(cleanup, true);
        return Promise.resolve();
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
        this.#assertNotDisposed();
        const previousScope = activeScope;
        activeScope = this;
        try {
            return func();
        } finally {
            activeScope = previousScope;
        }
    }

    /**
     * Clears the currently owned child scopes, cleanup callbacks, and slot values.
     */
    protected clear(): void {
        const parent = this.#parent;
        if (parent != null) {
            parent.#children.delete(this);
        }
        const currentChildren = [ ...this.#children ];
        this.#children.clear();
        const currentCleanups = [ ...this.#cleanups.keys() ];
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
        if (errors.length > 0) {
            throwErrors(errors, "Scope cleanup failed");
        }
    }

    /**
     * Asynchronously clears the currently owned child scopes, cleanup callbacks, and slot values.
     */
    protected async clearAsync(): Promise<void> {
        const currentChildren = [ ...this.#children ];
        this.#children.clear();
        const currentCleanups = [ ...this.#cleanups.keys() ];
        this.#cleanups.clear();
        const errors: unknown[] = [];
        for (const child of currentChildren) {
            try {
                await child.disposeAsync();
            } catch (error) {
                errors.push(error);
            }
        }
        for (const cleanup of currentCleanups) {
            try {
                await cleanup();
            } catch (error) {
                errors.push(error);
            }
        }
        this.#slots.clear();
        if (errors.length > 0) {
            throwErrors(errors, "Scope cleanup failed");
        }
    }

    /**
     * Returns whether this scope or any owned child scope requires asynchronous disposal.
     *
     * @returns True when asynchronous disposal is required.
     */
    protected requiresAsyncDisposal(): boolean {
        return this.#disposePromise != null
            || [ ...this.#cleanups.values() ].some(Boolean)
            || [ ...this.#children ].some(child => child.requiresAsyncDisposal());
    }

    /**
     * Throws when this scope was already disposed.
     *
     */
    #assertNotDisposed(): void {
        if (this.#disposed) {
            throw new ScopeError("Scope is disposed");
        }
    }
}

/** Normal scope implementation owned by an explicit parent, active scope, or shared root scope. */
class ChildScope extends Scope {
    public constructor(parent: Scope = activeScope ?? rootScope) {
        super(parent);
    }
}

/** Shared root scope implementation. */
class RootScope extends Scope {
    /** Currently running asynchronous reset, or null when no reset is running. */
    #resetPromise: Promise<void> | null = null;

    public constructor() {
        super(null);
    }

    /** The shared root scope itself cannot be disposed. */
    public override dispose(): void {
        throw new ScopeError("Cannot dispose the shared root scope");
    }

    /** The shared root scope itself cannot be disposed. */
    public override disposeAsync(): Promise<void> {
        return Promise.reject(new ScopeError("Cannot dispose the shared root scope"));
    }

    /** Resets the shared root scope without replacing it. */
    public reset(): void {
        if (this.#resetPromise != null || this.requiresAsyncDisposal()) {
            throw new ScopeError("Scope requires asynchronous disposal");
        }
        this.clear();
    }

    /** Asynchronously resets the shared root scope without replacing it. */
    public resetAsync(): Promise<void> {
        if (this.#resetPromise == null) {
            this.#resetPromise = this.#runAsyncReset();
        }
        return this.#resetPromise;
    }

    /** Runs an asynchronous root-scope reset and releases the cached operation afterwards. */
    async #runAsyncReset(): Promise<void> {
        try {
            await this.clearAsync();
        } finally {
            this.#resetPromise = null;
        }
    }
}

/** Shared root scope for scopes created without an active scope and for explicit long-lived ownership. */
const rootScope = new RootScope();

/**
 * Returns the currently active scope.
 *
 * @returns The active scope or null.
 */
export function getActiveScope(): Scope | null {
    return activeScope;
}

/**
 * Returns the shared root scope.
 *
 * The shared root scope is not active by default. Scopes created without an active scope are attached to it. Use
 * {@link resetRootScope} to clear it while keeping the same shared scope instance.
 *
 * @returns The shared root scope.
 */
export function getRootScope(): Scope {
    return rootScope;
}

/**
 * Resets the shared root scope without replacing it.
 *
 * This disposes the root scope's current child scopes, runs its registered cleanup callbacks, and clears its local slot values, but
 * keeps the shared root scope itself usable afterwards.
 *
 * @throws {@link ScopeError} - When the root scope owns asynchronous cleanup and must be reset through {@link resetRootScopeAsync}.
 */
export function resetRootScope(): void {
    rootScope.reset();
}

/**
 * Asynchronously resets the shared root scope without replacing it.
 *
 * This disposes the root scope's current child scopes, awaits its registered cleanup callbacks, and clears its local slot values, but keeps the shared
 * root scope itself usable afterwards.
 *
 * @returns Promise which resolves when the root scope has been reset.
 */
export function resetRootScopeAsync(): Promise<void> {
    return rootScope.resetAsync();
}

/**
 * Creates a scope.
 *
 * Without an explicit parent, the created scope is owned by the current active scope, or by the shared root scope when no scope is
 * active.
 *
 * The returned scope can be activated later through {@link Scope.run} and disposed synchronously or asynchronously.
 *
 * @returns The created scope.
 */
export function createScope(): Scope;

/**
 * Creates a scope with the given explicit parent scope.
 *
 * @param parent - The explicit parent scope.
 * @returns The created scope.
 */
export function createScope(parent: Scope): Scope;

/**
 * Creates a scope and returns the value produced by the callback.
 *
 * This is shorthand for creating a scope and immediately running the callback inside it. Without an explicit parent, the created scope is
 * owned by the current active scope, or by the shared root scope when no scope is active.
 *
 * Only the synchronous execution of the callback belongs to this scope. Work created after an `await` no longer belongs to this scope.
 * If the callback returns a promise, that promise is returned as-is and is not awaited.
 *
 * Cleanup callbacks registered while the callback runs belong to this scope and run together when the scope is disposed. Scope-local
 * values written during that time also belong to this scope. Nested scopes are owned the same way.
 *
 * `scope.onDispose` and `scope.onAsyncDispose` register additional cleanup callbacks on this scope. Only the synchronous part of the callback belongs to the
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
 * @param parent - The explicit parent scope.
 * @param func   - Uses the scope and receives the scope handle.
 * @returns The value returned by the callback.
 */
export function createScope<T>(parent: Scope, func: (scope: Scope) => T): T;

export function createScope<T>(parentOrFunc?: Scope | ((scope: Scope) => T), func?: (scope: Scope) => T): Scope | T {
    const parent = typeof parentOrFunc === "function" || parentOrFunc == null ? undefined : parentOrFunc;
    const callback = typeof parentOrFunc === "function" ? parentOrFunc : func;
    const scope = new ChildScope(parent);
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

/**
 * Registers an asynchronous cleanup callback on the currently active scope, if there is one.
 *
 * @param cleanup - The asynchronous cleanup callback to register.
 * @returns Promise which resolves immediately after registration, or after immediate cleanup when the active scope is already disposed.
 */
export function onAsyncDispose(cleanup: () => PromiseLike<void>): Promise<void> {
    return activeScope?.onAsyncDispose(cleanup) ?? Promise.resolve();
}
