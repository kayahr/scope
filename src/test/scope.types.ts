/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { Scope, createScope, getActiveScope, onDispose } from "../main/scope.ts";
import { ScopeSlot } from "../main/slot.ts";

const scope: Scope = createScope();
const constructedScope: Scope = new Scope();
const runResult: number = scope.run(() => 1);
const maybeActiveScope: Scope | null = getActiveScope();
const numberSlot: ScopeSlot<number> = ScopeSlot.create<number>();
const localNumber: number = scope.set(numberSlot, 1);
const maybeLocalNumber: number | undefined = scope.get(numberSlot);
const hasLocalNumber: boolean = scope.has(numberSlot);
const deletedLocalNumber: boolean = scope.delete(numberSlot);
const maybeFoundNumber: number | undefined = scope.find(numberSlot);
onDispose(() => undefined);
void runResult;
void maybeActiveScope;
void localNumber;
void maybeLocalNumber;
void hasLocalNumber;
void deletedLocalNumber;
void maybeFoundNumber;
void constructedScope;

const result = createScope((localScope: Scope) => {
    const scopeDisposer: () => void = () => localScope.dispose();
    const disposedState: boolean = localScope.isDisposed();
    const parentScope: Scope | null = localScope.getParent();
    const storedNumber: number = localScope.set(numberSlot, 2);
    void scopeDisposer;
    void disposedState;
    void parentScope;
    void storedNumber;
    localScope.onDispose(() => undefined);
    const nestedResult: number = localScope.run(() => 2);
    void nestedResult;
    return 1;
});
const value: number = result;
void value;

createScope(scope).run(() => 1);
createScope(null).run(() => 1);
new Scope(scope).run(() => 1);
new Scope(null).run(() => 1);

createScope(localScope => {
    // @ts-expect-error onDispose expects a cleanup callback.
    localScope.onDispose(1);
    return 0;
});

// @ts-expect-error Slot value type must match the slot.
scope.set(numberSlot, "wrong");

createScope(localScope => {
    // @ts-expect-error delete expects a scope slot.
    localScope.delete(1);
    return 0;
});

// @ts-expect-error Explicit parent must be a real Scope instance.
createScope({});

// @ts-expect-error Constructor parent must be a real Scope instance.
const invalidConstructedScope: Scope = new Scope({});
void invalidConstructedScope;

// @ts-expect-error ScopeSlot constructor is private.
const invalidSlot = new ScopeSlot<number>();
void invalidSlot;
