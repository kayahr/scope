/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Typed slot token for storing one scope-local value.
 *
 * Slots are compared by object identity. Each call to {@link create} returns a
 * distinct slot token.
 *
 * @template T - The value type stored under this slot.
 */
export class ScopeSlot<T> {
    /** Type-only private property binding the slot value type to this slot instance. */
    private declare readonly valueType: T;

    /** Prevents direct construction; use {@link create} instead. */
    private constructor() {}

    /**
     * Creates a new typed slot for storing scope-local values.
     *
     * @template T - The value type stored under this slot.
     * @returns The created slot token.
     */
    public static create<T>(): ScopeSlot<T> {
        return new ScopeSlot<T>();
    }
}
