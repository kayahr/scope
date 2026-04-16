/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";
import { assertEquals } from "@kayahr/assert";
import * as exports from "../main/index.ts";
import { dispose } from "../main/dispose.ts";
import { ScopeError } from "../main/error.ts";
import { Scope, createScope, getActiveScope, getRootScope, onDispose } from "../main/scope.ts";
import { ScopeSlot } from "../main/slot.ts";

describe("index", () => {
    it("exports relevant types and functions and nothing more", () => {
        assertEquals({ ...exports }, {
            createScope,
            dispose,
            getActiveScope,
            getRootScope,
            onDispose,
            Scope,
            ScopeSlot,
            ScopeError
        });

        ((): Scope => ((new exports.Scope())))();
        ((): Scope => (exports.getRootScope()))();
        ((): ScopeSlot<number> => (exports.ScopeSlot.create<number>()))();
    });
});
