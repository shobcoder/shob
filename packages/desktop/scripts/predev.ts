import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.SHOB_CHANNEL ?? "dev"}`

await $`cd ../shob && bun script/build-node.ts`
