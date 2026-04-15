/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";
import { assertEquals, assertInstanceOf, assertSame } from "@kayahr/assert";
import { throwErrors } from "../main/error.ts";

describe("throwErrors", () => {
    it("throws a single flattened error directly", () => {
        let thrown: unknown = null;

        try {
            throwErrors([ new AggregateError([ "boom" ], "inner") ], "outer");
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, Error);
        assertSame(thrown.message, "boom");
    });

    it("flattens nested aggregate errors recursively", () => {
        let thrown: unknown = null;

        try {
            throwErrors([
                new AggregateError([
                    new Error("first"),
                    new AggregateError([
                        "second",
                        new AggregateError([ new Error("third") ], "deep")
                    ], "inner")
                ], "outer")
            ], "flattened");
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "flattened");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "first", "second", "third" ]);
    });
});
