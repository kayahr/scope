/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";
import {
    assertEquals,
    assertFalse,
    assertInstanceOf,
    assertNull,
    assertSame,
    assertThrowWithMessage,
    assertTrue,
    assertUndefined
} from "@kayahr/assert";
import { dispose } from "../main/dispose.ts";
import { ScopeError } from "../main/error.ts";
import { Scope, createScope, getActiveScope, getRootScope, onDispose, resetRootScope } from "../main/scope.ts";
import { ScopeSlot } from "../main/slot.ts";

describe("createScope", () => {
    it("creates a reusable scope handle without a callback", () => {
        const seen: string[] = [];
        const scope: Scope = createScope();

        scope.run(() => {
            onDispose(() => {
                seen.push("cleanup");
            });
            assertSame(getActiveScope(), scope);
        });

        assertEquals(seen, []);

        scope.dispose();
        assertEquals(seen, [ "cleanup" ]);
    });

    it("creates Scope instances through the factory", () => {
        const created = createScope();

        assertInstanceOf(created, Scope);
    });

    it("returns one shared root scope which is not active by default", () => {
        const rootA = getRootScope();
        const rootB = getRootScope();

        assertSame(rootA, rootB);
        assertNull(rootA.getParent());
        assertNull(getActiveScope());
    });

    it("uses the shared root scope when no scope is active", () => {
        const root = getRootScope();
        const created = createScope();

        assertSame(created.getParent(), root);
    });

    it("creates explicit child scopes under a given parent", () => {
        const parent = createScope();
        const child = createScope(parent);

        assertSame(child.getParent(), parent);
        assertFalse(child.isDisposed());
    });

    it("throws when creating a child scope under a disposed parent", () => {
        const parent = createScope();
        parent.dispose();

        assertThrowWithMessage(() => {
            createScope(parent);
        }, ScopeError, "Cannot create a child scope under a disposed parent scope");
    });

    it("disposes explicit child scopes together with their parent", () => {
        const seen: string[] = [];
        const parent = createScope();
        createScope(parent).onDispose(() => {
            seen.push("child");
        });

        parent.dispose();

        assertEquals(seen, [ "child" ]);
    });

    it("creates explicit child scopes under the shared root scope", () => {
        const root = getRootScope();
        const child = createScope(root);

        assertSame(child.getParent(), root);

        child.dispose();
    });

    it("throws when disposing the shared root scope", () => {
        const root = getRootScope();

        assertThrowWithMessage(() => {
            root.dispose();
        }, ScopeError, "Cannot dispose the shared root scope");
        assertFalse(root.isDisposed());
    });

    it("resets the shared root scope without disposing it", () => {
        const root = getRootScope();
        const slot = ScopeSlot.create<string>();
        const seen: string[] = [];

        resetRootScope();
        root.set(slot, "root");
        root.onDispose(() => {
            seen.push("root");
        });
        createScope().onDispose(() => {
            seen.push("child");
        });

        resetRootScope();

        assertEquals(seen, [ "child", "root" ]);
        assertFalse(root.isDisposed());
        assertUndefined(root.get(slot));
        assertFalse(root.has(slot));
        assertNull(root.getParent());
        assertNull(getActiveScope());

        const child = createScope();
        assertSame(child.getParent(), root);
        child.dispose();
    });

    it("keeps the shared root scope usable after reset failures", () => {
        const root = getRootScope();
        const slot = ScopeSlot.create<string>();

        resetRootScope();
        root.onDispose(() => {
            throw "root boom";
        });
        createScope().onDispose(() => {
            throw "child boom";
        });

        let thrown: unknown = null;
        try {
            resetRootScope();
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "Scope cleanup failed");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "child boom", "root boom" ]);
        assertFalse(root.isDisposed());
        assertNull(root.getParent());
        assertNull(getActiveScope());
        assertUndefined(root.get(slot));
        assertFalse(root.has(slot));
        assertSame(root.set(slot, "root"), "root");

        const child = createScope();
        assertSame(child.getParent(), root);
        child.dispose();
        resetRootScope();
    });

    it("aggregates child-scope disposal failures together with parent disposal failures", () => {
        const parent = createScope();
        const child = createScope(parent);
        child.onDispose(() => {
            throw "child boom";
        });
        parent.onDispose(() => {
            throw "parent boom";
        });

        let thrown: unknown = null;
        try {
            parent.dispose();
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "Scope cleanup failed");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "child boom", "parent boom" ]);
    });

    it("runs onDispose callbacks when the scope is disposed", () => {
        const seen: string[] = [];
        const scope = createScope(scope => {
            scope.onDispose(() => {
                seen.push("first");
            });
            scope.onDispose(() => {
                seen.push("second");
            });
            return scope;
        });

        scope.dispose();
        assertEquals(seen, [ "first", "second" ]);
    });

    it("runs late onDispose registrations immediately after disposal", () => {
        const seen: string[] = [];
        const scope = createScope();

        scope.dispose();
        scope.onDispose(() => {
            seen.push("late");
        });

        assertEquals(seen, [ "late" ]);
    });

    it("aggregates multiple cleanup failures", () => {
        const scope = createScope();
        scope.onDispose(() => {
            throw new Error("first boom");
        });
        scope.onDispose(() => {
            throw "second boom";
        });

        let thrown: unknown = null;
        try {
            scope.dispose();
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "Scope cleanup failed");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "first boom", "second boom" ]);
    });

    it("throws a single cleanup failure directly", () => {
        const scope = createScope();
        scope.onDispose(() => {
            throw "boom";
        });

        let thrown: unknown = null;
        try {
            scope.dispose();
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, Error);
        assertSame(thrown.message, "boom");
    });

    it("prioritizes callback failures over cleanup failures", () => {
        let thrown: unknown = null;

        try {
            createScope(scope => {
                scope.onDispose(() => {
                    throw "cleanup boom";
                });
                throw "callback boom";
            });
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "Scope callback failed");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "callback boom", "cleanup boom" ]);
    });

    it("flattens aggregate cleanup failures after a callback failure", () => {
        let thrown: unknown = null;

        try {
            createScope(scope => {
                scope.onDispose(() => {
                    throw "cleanup boom 1";
                });
                scope.onDispose(() => {
                    throw "cleanup boom 2";
                });
                throw "callback boom";
            });
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "Scope callback failed");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "callback boom", "cleanup boom 1", "cleanup boom 2" ]);
    });

    it("rethrows the callback failure directly when scope cleanup succeeds", () => {
        let thrown: unknown = null;

        try {
            createScope(() => {
                throw "callback boom";
            });
        } catch (error) {
            thrown = error;
        }

        assertSame(thrown, "callback boom");
    });

    it("throws when running a disposed scope", () => {
        const scope = createScope();

        scope.dispose();

        assertThrowWithMessage(() => {
            scope.run(() => 1);
        }, ScopeError, "Scope is disposed");
    });

    it("restores the previous active scope after running", () => {
        const outer = createScope();
        const inner = createScope();
        let seen: ReadonlyArray<Scope | null> = [];

        outer.run(() => {
            seen = [
                getActiveScope(),
                inner.run(() => getActiveScope()),
                getActiveScope()
            ];
        });

        assertSame(seen[0], outer);
        assertSame(seen[1], inner);
        assertSame(seen[2], outer);
        assertNull(getActiveScope());
    });

    it("disposes generic disposables", () => {
        const seen: string[] = [];
        const handle: Disposable = {
            [Symbol.dispose](): void {
                seen.push("disposed");
            }
        };

        dispose(handle);

        assertEquals(seen, [ "disposed" ]);
    });

    it("ignores repeated disposal", () => {
        const seen: string[] = [];
        const scope = createScope();
        scope.onDispose(() => {
            seen.push("disposed");
        });

        scope.dispose();
        scope.dispose();

        assertEquals(seen, [ "disposed" ]);
    });

    it("registers ambient cleanups only while a scope is active", () => {
        const seen: string[] = [];
        const scope = createScope();

        onDispose(() => {
            seen.push("ignored");
        });
        scope.run(() => {
            onDispose(() => {
                seen.push("owned");
            });
        });

        scope.dispose();

        assertEquals(seen, [ "owned" ]);
    });

    it("stores and reads scope-local slot values", () => {
        const numberSlot = ScopeSlot.create<number>();
        const scope = createScope();

        assertFalse(scope.has(numberSlot));
        assertUndefined(scope.get(numberSlot));
        assertUndefined(scope.find(numberSlot));
        assertSame(scope.set(numberSlot, 42), 42);
        assertTrue(scope.has(numberSlot));
        assertSame(scope.get(numberSlot), 42);
        assertSame(scope.find(numberSlot), 42);
    });

    it("distinguishes a stored null value from an absent slot", () => {
        const nullableSlot = ScopeSlot.create<string | null>();
        const scope = createScope();

        assertUndefined(scope.get(nullableSlot));
        assertUndefined(scope.find(nullableSlot));
        assertNull(scope.set(nullableSlot, null));
        assertTrue(scope.has(nullableSlot));
        assertNull(scope.get(nullableSlot));
        assertNull(scope.find(nullableSlot));
    });

    it("finds slot values through the parent chain and prefers the nearest scope", () => {
        const slot = ScopeSlot.create<string>();
        const parent = createScope();
        const child = createScope(parent);
        const grandchild = createScope(child);

        parent.set(slot, "parent");
        assertSame(child.find(slot), "parent");

        child.set(slot, "child");
        assertSame(grandchild.find(slot), "child");
    });

    it("throws when reading slot values during child cleanup triggered by parent disposal", () => {
        const slot = ScopeSlot.create<string>();
        const parent = createScope();
        const child = createScope(parent);

        parent.set(slot, "parent");
        child.onDispose(() => {
            child.find(slot);
        });

        assertThrowWithMessage(() => {
            parent.dispose();
        }, ScopeError, "Scope is disposed");
    });

    it("throws when reading the parent chain after disposal", () => {
        const slot = ScopeSlot.create<string>();
        const parent = createScope();
        const child = createScope(parent);

        parent.set(slot, "parent");
        child.dispose();

        assertThrowWithMessage(() => {
            child.getParent();
        }, ScopeError, "Scope is disposed");
        assertThrowWithMessage(() => {
            child.find(slot);
        }, ScopeError, "Scope is disposed");
    });

    it("throws when reading slot values after disposal", () => {
        const slot = ScopeSlot.create<number>();
        const scope = createScope();

        scope.set(slot, 1);
        scope.dispose();

        assertThrowWithMessage(() => {
            scope.get(slot);
        }, ScopeError, "Scope is disposed");
        assertThrowWithMessage(() => {
            scope.has(slot);
        }, ScopeError, "Scope is disposed");
        assertThrowWithMessage(() => {
            scope.find(slot);
        }, ScopeError, "Scope is disposed");
    });

    it("throws when writing slot values after disposal", () => {
        const slot = ScopeSlot.create<number>();
        const scope = createScope();

        scope.dispose();
        assertTrue(scope.isDisposed());

        assertThrowWithMessage(() => {
            scope.set(slot, 1);
        }, ScopeError, "Scope is disposed");
    });

    it("deletes local slot values without touching parents", () => {
        const slot = ScopeSlot.create<number>();
        const parent = createScope();
        const child = createScope(parent);

        parent.set(slot, 1);
        child.set(slot, 2);

        assertTrue(child.delete(slot));
        assertUndefined(child.get(slot));
        assertSame(child.find(slot), 1);
        assertFalse(child.delete(slot));
    });

    it("throws when deleting slot values after disposal", () => {
        const slot = ScopeSlot.create<number>();
        const scope = createScope();

        scope.dispose();

        assertThrowWithMessage(() => {
            scope.delete(slot);
        }, ScopeError, "Scope is disposed");
    });

    it("supports disposal through Symbol.dispose", () => {
        const seen: string[] = [];
        const scope = createScope();

        scope.onDispose(() => {
            seen.push("disposed");
        });

        scope[Symbol.dispose]();

        assertEquals(seen, [ "disposed" ]);
        assertTrue(scope.isDisposed());
    });
});
