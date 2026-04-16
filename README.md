# scope

[GitHub] | [NPM] | [API Doc]

Small, framework-independent ownership scopes for TypeScript.

`@kayahr/scope` provides disposable ownership scopes, cleanup registration, parent/child scope trees, and typed scope-local values.

## Installation

```bash
npm install @kayahr/scope
```

TypeScript consumers currently need a compatible `lib` configuration including `esnext.disposable`.

Runtimes without native `Symbol.dispose` need a polyfill before importing `@kayahr/scope`, for example from [core-js](https://www.npmjs.com/package/core-js):

```ts
import "core-js/proposals/explicit-resource-management";
```

## Basic Usage

Create a scope, activate it while constructing owned resources, and dispose it later as one unit:

```ts
import { createScope, onDispose } from "@kayahr/scope";

const scope = createScope();

scope.run(() => {
    const interval = setInterval(() => {
        console.log("tick");
    }, 1000);

    onDispose(() => {
        clearInterval(interval);
    });
});

// ...
scope.dispose();
```

`createScope()` creates a scope. Without an explicit parent, it uses the current active scope as parent, or the shared root scope when no scope is active. `createScope(scope => ...)` is shorthand for creating a scope and running a callback inside it. Only the synchronous execution of `scope.run(...)` or `createScope(scope => ...)` belongs to the scope. Work created after an `await` is outside that scope. If the callback returns a promise, that promise is returned as-is and is not awaited.

`getRootScope()` returns the shared root scope. It is not active by default, but scopes created without an active scope are attached to it. `resetRootScope()` clears the shared root scope without replacing it.

## Documentation

- [Scopes](doc/scopes.md)
- [Scope Slots](doc/slots.md)

[API Doc]: https://kayahr.github.io/scope/
[GitHub]: https://github.com/kayahr/scope
[NPM]: https://www.npmjs.com/package/@kayahr/scope
