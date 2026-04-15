# Scope Slots

Scope slots are typed tokens for storing values on a scope and resolving them through the parent chain.

## Creating Slots

Create a slot with `ScopeSlot.create<T>()`:

```ts
import { createScope, ScopeSlot } from "@kayahr/scope";

const localeSlot = ScopeSlot.create<string>();

const root = createScope();
root.set(localeSlot, "en");

const child = createScope(root);
child.get(localeSlot);  // undefined
child.find(localeSlot); // "en"

child.set(localeSlot, "de");
child.get(localeSlot);  // "de"
child.find(localeSlot); // "de"
```

Slots are compared by identity, not by name.

## Lookup

- `scope.set(slot, value)` stores a local value on one scope.
- `scope.get(slot)` reads only the local value from that scope.
- `scope.has(slot)` checks whether that scope has a local value.
- `scope.delete(slot)` removes only the local value from that scope.
- `scope.find(slot)` walks up the parent chain and returns the nearest stored value.

`scope.get(...)` and `scope.find(...)` return `undefined` when no value exists.

## Disposal

After disposal has completed, local slot values are cleared. `scope.get(...)` and `scope.find(...)` return `undefined`, and `scope.has(...)` returns `false`.

Writing to a disposed scope throws a `ScopeError`. That includes `set(...)` and `delete(...)`.
