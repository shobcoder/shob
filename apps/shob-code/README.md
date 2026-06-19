# Shob CLI

This package is the slim publishable CLI boundary for Shob.

It intentionally keeps the package surface small:

- `bin/shob.cjs` launches the bundled Shob binary.
- `script/build.ts` builds the CLI from the local Shob server entrypoint.
- `dist/` is generated and included when publishing.

Build before publishing:

```sh
bun run build
```
