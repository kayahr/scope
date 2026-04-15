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
import { Scope, createScope, getActiveScope, onDispose } from "../main/scope.ts";
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

    it("creates real Scope instances through the constructor and factory", () => {
        const constructed = new Scope();
        const created = createScope();

        assertInstanceOf(constructed, Scope);
        assertInstanceOf(created, Scope);
    });

    it("creates explicit child scopes under a given parent", () => {
        const parent = createScope();
        const child = createScope(parent);

        assertSame(child.getParent(), parent);
        assertFalse(child.isDisposed());
    });

    it("creates detached root scopes when null is passed explicitly", () => {
        const constructed = new Scope(null);
        const created = createScope(null);

        assertNull(constructed.getParent());
        assertNull(created.getParent());
    });

    it("throws when creating a child scope under a disposed parent", () => {
        const parent = createScope();
        parent.dispose();

        assertThrowWithMessage(() => {
            createScope(parent);
        }, ScopeError, "Cannot create a child scope under a disposed parent scope");
        assertThrowWithMessage(() => {
            void new Scope(parent);
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
        }, ScopeError, "Cannot run in a disposed scope");
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

    it("keeps parent slot values readable during child cleanup triggered by parent disposal", () => {
        const slot = ScopeSlot.create<string>();
        const parent = createScope();
        const child = createScope(parent);
        const seen: Array<string | undefined> = [];

        parent.set(slot, "parent");
        child.onDispose(() => {
            seen.push(child.find(slot));
        });

        parent.dispose();

        assertEquals(seen, [ "parent" ]);
    });

    it("detaches a disposed child scope from its parent chain", () => {
        const slot = ScopeSlot.create<string>();
        const parent = createScope();
        const child = createScope(parent);

        parent.set(slot, "parent");
        child.dispose();

        assertNull(child.getParent());
        assertUndefined(child.find(slot));
    });

    it("clears local slot values after disposal", () => {
        const slot = ScopeSlot.create<number>();
        const scope = createScope();

        scope.set(slot, 1);
        scope.dispose();

        assertUndefined(scope.get(slot));
        assertFalse(scope.has(slot));
    });

    it("throws when writing slot values after disposal", () => {
        const slot = ScopeSlot.create<number>();
        const scope = createScope();

        scope.dispose();
        assertTrue(scope.isDisposed());

        assertThrowWithMessage(() => {
            scope.set(slot, 1);
        }, ScopeError, "Cannot write to a disposed scope");
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
        }, ScopeError, "Cannot delete from a disposed scope");
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
