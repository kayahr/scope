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

`getRootScope()` returns the shared root scope. It is not active by default, but scopes created without an active scope are attached to it. The shared root scope cannot be disposed. `resetRootScope()` synchronously clears its current contents, while `resetRootScopeAsync()` also supports asynchronous cleanup. Both functions keep the shared root scope itself usable.

## Active Scope

`scope.run(...)` temporarily makes that scope the active scope. `getActiveScope()` returns the current active scope. `onDispose(...)` and `onAsyncDispose(...)` register cleanup on it.

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

Disposing a parent also disposes all of its current child scopes in reverse creation order before running the parent's own cleanup callbacks. Creating a child scope under an already disposed parent throws a `ScopeError`.

## Synchronous Cleanup

`scope.onDispose(...)` registers cleanup on a specific scope, while `onDispose(...)` registers it on the current active scope, if there is one.

Calling `scope.onDispose(...)` after the scope has already been disposed runs the cleanup immediately.

Call `scope.dispose()` to synchronously dispose all child scopes in reverse creation order, run all synchronous cleanup callbacks in reverse registration order, and clear all scope-local values. If the scope or one of its descendants owns asynchronous cleanup, `dispose()` throws a `ScopeError` without disposing the scope. Use `disposeAsync()` in that case.

Use `resetRootScope()` to synchronously dispose the shared root scope's current child scopes, run its cleanup callbacks, and clear its local values without disposing the root scope itself. Like `dispose()`, it throws a `ScopeError` when asynchronous cleanup is required.

## Asynchronous Cleanup

`scope.onAsyncDispose(...)` and `onAsyncDispose(...)` register cleanup which returns a promise. Dispose such a scope with `scope.disposeAsync()`:

```ts
import { createScope, onAsyncDispose } from "@kayahr/scope";

const scope = createScope();

scope.run(() => {
    const connection = openConnection();

    void onAsyncDispose(async () => {
        await connection.close();
    });
});

await scope.disposeAsync();
```

Asynchronous disposal supports both synchronous and asynchronous cleanup. Child scopes are disposed sequentially in reverse creation order, then the scope's own cleanup callbacks are awaited sequentially in reverse registration order. Concurrent calls to `disposeAsync()` share the same disposal operation.

Calling `scope.onAsyncDispose(...)` after the scope has already been disposed runs the cleanup immediately. The returned promise represents completion of this late cleanup.

Use `resetRootScopeAsync()` to asynchronously clear the shared root scope without disposing it. It supports both synchronous and asynchronous cleanup, and concurrent calls share the same reset operation.

## Explicit Resource Management

Scopes implement both `Disposable` and `AsyncDisposable`, so they can be managed with the explicit resource management syntax:

```ts
{
    using scope = createScope();
    scope.onDispose(() => stopWorker());
}

{
    await using scope = createScope();
    void scope.onAsyncDispose(() => closeConnection());
}
```

`using` invokes `Symbol.dispose` and therefore only supports scopes with synchronous cleanup. `await using` invokes `Symbol.asyncDispose` and supports both synchronous and asynchronous cleanup.

The `dispose(...)` helper invokes `Symbol.dispose` on any `Disposable`. The `disposeAsync(...)` helper prefers `Symbol.asyncDispose` and falls back to `Symbol.dispose`, so it accepts both `AsyncDisposable` and `Disposable` handles.

## Disposal Behavior

- Repeated disposal does not run cleanup again.
- Disposal marks the scope as disposed before cleanup starts. Disposed scopes are no longer usable and throw a `ScopeError` when used.
- Disposal continues after individual child scopes or cleanup callbacks fail.
- A single disposal failure is thrown directly. Multiple failures are combined in an `AggregateError` in execution order.
- If a `createScope(scope => ...)` callback throws and synchronous cleanup also fails, the callback error is listed first in the aggregate failure.
