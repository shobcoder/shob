#!/usr/bin/env bun
import { $ } from "bun"

await $`bun ./scripts/copy-metainfo.ts`

await $`cd ../shob && bun script/build-node.ts`
