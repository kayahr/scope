# Scopes

Scopes are ownership boundaries for cleanup callbacks, child scopes, and scope-local values. A scope can be made active with `scope.run(...)` and later disposed as one unit.

## Creating Scopes

`createScope()` creates a scope. Without an explicit parent, it uses the current active scope as parent, or the shared root scope when no scope is active.

```ts
import { createScope, onDispose } from "@kayahr/scope";

const scope = createScope();

scope.run(() => {
    const controller = new AbortController();
    const timer = setInterval(() => {
        // ...
    }, 1000);

    onDispose(() => controller.abort());
    onDispose(() => clearInterval(timer));
});

// ...
scope.dispose();
```

`createScope(scope => ...)` is shorthand for creating a scope and immediately running a callback inside it. `createScope(parent, scope => ...)` does the same with an explicit parent.

`getRootScope()` returns the shared root scope. It is not active by default, but scopes created without an active scope are attached to it. The shared root scope cannot be disposed.

## Active Scope

`scope.run(...)` temporarily makes that scope the active scope. `getActiveScope()` returns the current active scope, and `onDispose(...)` registers cleanup on it.

Only the synchronous execution of `scope.run(...)` or `createScope(scope => ...)` belongs to the scope. Work created after an `await` is outside that scope. If the callback returns a promise, that promise is returned as-is and is not awaited.

## Parent and Child Scopes

`createScope(parent)` creates an explicit child scope.

```ts
import { createScope } from "@kayahr/scope";

const parent = createScope();
const child = createScope(parent);

child.onDispose(() => {
    console.log("child cleanup");
});

parent.dispose();
```

Disposing a parent also disposes all of its current child scopes. Creating a child scope under an already disposed parent throws a `ScopeError`.

## Cleanup

- `scope.onDispose(...)` registers cleanup on one scope.
- `onDispose(...)` registers cleanup on the current active scope, if there is one.
- Late `scope.onDispose(...)` registration after disposal runs immediately.
- Repeated disposal is ignored.
- If multiple cleanups fail, disposal throws an `AggregateError`.
- If a `createScope(scope => ...)` callback throws and cleanup also fails, the callback error is listed first in the aggregate failure.
