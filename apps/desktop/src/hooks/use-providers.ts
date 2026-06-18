import { useGlobalSync } from "@/context/global-sync"
import { createMemo } from "solid-js"

export const popularProviders = [
  "anthropic",
  "github-copilot",
  "openai",
  "xai",
  "zai-coding-plan",
  "google",
  "antigravity",
  "cline",
  "openrouter",
  "kilo",
  "vercel",
  "mimo-free",
]
const popularProviderSet = new Set(popularProviders)

export function useProviders() {
  const globalSync = useGlobalSync()
  const providers = () => {
    return globalSync.data.provider
  }
  return {
    all: () => providers().all,
    default: () => providers().default,
    popular: () => providers().all.filter((p) => popularProviderSet.has(p.id)),
    connected: () => {
      const connected = new Set(providers().connected)
      return providers().all.filter((p) => connected.has(p.id))
    },
    paid: () => {
      const connected = new Set(providers().connected)
      return providers().all.filter(
        (p) => connected.has(p.id) && (p.id !== "shob" || Object.values(p.models).some((m) => m.cost?.input)),
      )
    },
  }
}
