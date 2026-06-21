import { Button } from "@shob-ai/ui/button"
import { useDialog } from "@shob-ai/ui/context/dialog"
import { Dialog } from "@shob-ai/ui/dialog"
import { IconButton } from "@shob-ai/ui/icon-button"
import { ProviderIcon } from "@shob-ai/ui/provider-icon"
import { useMutation } from "@tanstack/solid-query"
import { TextField } from "@shob-ai/ui/text-field"
import { showToast } from "@shob-ai/ui/toast"
import { batch, createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"

interface FetchedModel {
  id: string
  name: string
  selected: boolean
}

interface FormState {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  modelID: string
  err: {
    providerID?: string
    name?: string
    baseURL?: string
    apiKey?: string
    modelID?: string
    fetch?: string
  }
}

const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"
const ANTHROPIC_COMPATIBLE = "@ai-sdk/anthropic"

export const SHOB_OPENAI_COMPATIBLE_PRESET = {
  providerID: "shob",
  name: "Shob AI Gateway",
  baseURL: "https://workspace.olova.dev/v1",
} as const

export const OPENCLAUDE_OPENAI_COMPATIBLE_PRESET = {
  providerID: "openclaude",
  name: "OpenClaude Gateway",
  baseURL: "https://opengateway.gitlawb.com/v1",
} as const

export const CUSTOM_ANTHROPIC_COMPATIBLE_PRESET = {
  providerID: "anthropic-compatible",
  name: "Anthropic Compatible",
  baseURL: "",
  modelID: "",
} as const

type Props = {
  defaults?: Partial<Pick<FormState, "providerID" | "name" | "baseURL" | "modelID">>
  iconID?: string
  apiKeyOnly?: boolean
  compatible?: "openai" | "anthropic"
}

const normalizeBaseURL = (value: string) => value.trim().replace(/\/+$/, "")
const normalizeAnthropicBaseURL = (value: string) => {
  const baseURL = normalizeBaseURL(value)
  if (/\/v1\/messages$/i.test(baseURL)) return baseURL.replace(/\/messages$/i, "")
  if (/\/messages$/i.test(baseURL)) return baseURL.replace(/\/messages$/i, "")
  if (/\/v1$/i.test(baseURL)) return baseURL
  return `${baseURL}/v1`
}

export function DialogOpenAICompatible(props: Props = {}) {
  const dialog = useDialog()
  const globalSync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const language = useLanguage()
  const server = useServer()

  const [form, setForm] = createStore<FormState>({
    providerID: props.defaults?.providerID ?? "",
    name: props.defaults?.name ?? "",
    baseURL: props.defaults?.baseURL ?? "",
    apiKey: "",
    modelID: props.defaults?.modelID ?? "",
    err: {},
  })

  const [models, setModels] = createSignal<FetchedModel[]>([])
  const [isFetching, setIsFetching] = createSignal(false)
  const [hasFetched, setHasFetched] = createSignal(false)
  const apiKeyOnly = () => props.apiKeyOnly === true
  const compatible = () => props.compatible ?? "openai"
  const modelFetchRoute = () =>
    compatible() === "anthropic" ? "anthropic-compatible/models" : "openai-compatible/models"

  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey" | "modelID", value: string) => {
    batch(() => {
      setForm(key, value)
      setForm("err", key, undefined)
      if (key === "baseURL" || key === "apiKey") {
        setModels([])
        setHasFetched(false)
      }
    })
  }

  const validateForm = () => {
    const providerID = form.providerID.trim()
    const name = form.name.trim()
    const baseURL = form.baseURL.trim()
    const apiKey = form.apiKey.trim()

    const idError = !providerID
      ? language.t("provider.custom.error.providerID.required")
      : !PROVIDER_ID.test(providerID)
        ? language.t("provider.custom.error.providerID.format")
        : undefined

    const nameError = !name ? language.t("provider.custom.error.name.required") : undefined
    const urlError = !baseURL
      ? language.t("provider.custom.error.baseURL.required")
      : !/^https?:\/\//.test(baseURL)
        ? language.t("provider.custom.error.baseURL.format")
        : undefined
    const keyError = !apiKey ? language.t("provider.custom.error.apiKey.required") : undefined

    batch(() => {
      setForm("err", "providerID", idError)
      setForm("err", "name", nameError)
      setForm("err", "baseURL", urlError)
      setForm("err", "apiKey", keyError)
    })

    return !idError && !nameError && !urlError && !keyError
  }

  const requestModels = async () => {
    const currentServer = server.current
    if (!currentServer) throw new Error("No server available")

    const auth = currentServer.http.password
      ? {
          Authorization: `Basic ${btoa(`${currentServer.http.username ?? "shob"}:${currentServer.http.password}`)}`,
        }
      : {}
    const response = await fetch(`${currentServer.http.url}/provider/${modelFetchRoute()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...auth,
      },
      body: JSON.stringify({
        baseURL: compatible() === "anthropic" ? normalizeAnthropicBaseURL(form.baseURL) : normalizeBaseURL(form.baseURL),
        apiKey: form.apiKey.trim(),
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (response.status === 404 && !data.error) {
        throw new Error("Local model fetch route was not found. Restart Shob and try again.")
      }
      throw new Error(data.error || `Failed to fetch models: ${response.status} ${response.statusText}`)
    }

    return data.data.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      selected: true,
    })) as FetchedModel[]
  }

  const fetchModels = async () => {
    if (!validateForm()) return

    setIsFetching(true)
    setForm("err", "fetch", undefined)
    setForm("err", "modelID", undefined)

    try {
      const fetchedModels = await requestModels()
      setModels(fetchedModels)
      setHasFetched(true)
      setForm("err", "modelID", undefined)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.openaiCompatible.fetch.success.title"),
        description: language.t("provider.openaiCompatible.fetch.success.description", { count: fetchedModels.length }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setForm("err", "fetch", message)
      showToast({
        variant: "error",
        title: language.t("provider.openaiCompatible.fetch.error.title"),
        description: message,
      })
    } finally {
      setIsFetching(false)
    }
  }

  const toggleModel = (index: number) => {
    setModels(
      produce((list) => {
        if (list[index]) {
          list[index].selected = !list[index].selected
        }
      })
    )
  }

  const selectAll = () => {
    setModels(
      produce((list) => {
        list.forEach((m) => (m.selected = true))
      })
    )
  }

  const deselectAll = () => {
    setModels(
      produce((list) => {
        list.forEach((m) => (m.selected = false))
      })
    )
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async (modelOverride?: FetchedModel[]) => {
      const providerID = form.providerID.trim()
      const name = form.name.trim()
      const baseURL =
        compatible() === "anthropic" ? normalizeAnthropicBaseURL(form.baseURL) : normalizeBaseURL(form.baseURL)
      const apiKey = form.apiKey.trim()

      const selectedModels = (modelOverride ?? models()).filter((m) => m.selected)
      if (selectedModels.length === 0) {
        throw new Error(language.t("provider.openaiCompatible.error.noModelsSelected"))
      }

      const modelConfig = Object.fromEntries(
        selectedModels.map((m) => [
          m.id,
          {
            name: m.name,
            ...(compatible() === "anthropic"
              ? {
                  limit: {
                    context: 200_000,
                    output: 8192,
                  },
                  modalities: {
                    input: ["text", "image", "pdf"] as Array<"text" | "image" | "pdf">,
                    output: ["text"] as Array<"text">,
                  },
                  tool_call: true,
                  reasoning: true,
                }
              : {}),
          },
        ])
      )

      await globalSDK.client.auth.set({
        providerID,
        auth: {
          type: "api",
          key: apiKey,
        },
      })

      const disabledProviders = globalSync.data.config.disabled_providers ?? []
      const nextDisabled = disabledProviders.filter((id) => id !== providerID)

      await globalSync.updateConfig({
        provider: {
          [providerID]: {
            npm: compatible() === "anthropic" ? ANTHROPIC_COMPATIBLE : OPENAI_COMPATIBLE,
            api: baseURL,
            name,
            options: {
              baseURL,
            },
            models: modelConfig,
          },
        },
        disabled_providers: nextDisabled,
      })
      await globalSDK.client.global.dispose()

      return { name }
    },
    onSuccess: (result) => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
        description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    if (saveMutation.isPending || isFetching()) return
    if (apiKeyOnly()) {
      if (!validateForm()) return
      setIsFetching(true)
      setForm("err", "fetch", undefined)
      requestModels()
        .then((fetchedModels) => {
          setModels(fetchedModels)
          setHasFetched(true)
          saveMutation.mutate(fetchedModels)
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          setForm("err", "fetch", message)
          showToast({
            variant: "error",
            title: language.t("provider.openaiCompatible.fetch.error.title"),
            description: message,
          })
        })
        .finally(() => setIsFetching(false))
      return
    }
    if (compatible() === "anthropic" && !hasFetched()) {
      if (!validateForm()) return
      if (!form.modelID.trim()) {
        setForm("err", "modelID", language.t("provider.custom.error.required"))
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: language.t("provider.openaiCompatible.error.fetchFirst"),
        })
        return
      }
      saveMutation.mutate([
        {
          id: form.modelID.trim(),
          name: form.modelID.trim(),
          selected: true,
        },
      ])
      return
    }
    if (!hasFetched()) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: language.t("provider.openaiCompatible.error.fetchFirst"),
      })
      return
    }
    saveMutation.mutate(undefined)
  }

  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={() => dialog.close()}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
        <div class="px-2.5 flex gap-4 items-center">
          <ProviderIcon id={props.iconID ?? "openai"} class="size-5 shrink-0 icon-strong-base" />
          <div class="text-16-medium text-text-strong">
            {props.defaults?.name ?? language.t("provider.openaiCompatible.title")}
          </div>
        </div>

        <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
          <Show when={props.iconID === "shob"}>
            <p class="text-14-regular text-text-base">
              Enter your Shob AI Gateway API key to connect your account and use Shob models in Shob.
            </p>
          </Show>
          <Show when={!apiKeyOnly()}>
            <p class="text-14-regular text-text-base">
              {compatible() === "anthropic"
                ? language.t("provider.anthropicCompatible.description")
                : language.t("provider.openaiCompatible.description")}
            </p>
          </Show>

          <div class="flex flex-col gap-4">
            <Show when={!apiKeyOnly()}>
              <TextField
                autofocus
                label={language.t("provider.custom.field.providerID.label")}
                placeholder={language.t("provider.custom.field.providerID.placeholder")}
                description={language.t("provider.custom.field.providerID.description")}
                value={form.providerID}
                onChange={(v) => setField("providerID", v)}
                validationState={form.err.providerID ? "invalid" : undefined}
                error={form.err.providerID}
              />
              <TextField
                label={language.t("provider.custom.field.name.label")}
                placeholder={language.t("provider.custom.field.name.placeholder")}
                value={form.name}
                onChange={(v) => setField("name", v)}
                validationState={form.err.name ? "invalid" : undefined}
                error={form.err.name}
              />
              <TextField
                label={language.t("provider.custom.field.baseURL.label")}
                placeholder={language.t("provider.custom.field.baseURL.placeholder")}
                value={form.baseURL}
                onChange={(v) => setField("baseURL", v)}
                validationState={form.err.baseURL ? "invalid" : undefined}
                error={form.err.baseURL}
              />
            </Show>
            <Show when={compatible() === "anthropic"}>
              <TextField
                label={language.t("provider.custom.models.id.label")}
                placeholder={language.t("provider.custom.models.id.placeholder")}
                value={form.modelID}
                onChange={(v) => setField("modelID", v)}
                validationState={form.err.modelID ? "invalid" : undefined}
                error={form.err.modelID}
              />
            </Show>
            <TextField
              autofocus={apiKeyOnly()}
              label={language.t("provider.custom.field.apiKey.label")}
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              description={props.iconID === "shob" ? undefined : language.t("provider.custom.field.apiKey.description")}
              value={form.apiKey}
              onChange={(v) => setField("apiKey", v)}
              validationState={form.err.apiKey ? "invalid" : undefined}
              error={form.err.apiKey}
            />
          </div>

          <Show when={form.err.fetch}>
            <div class="text-14-regular text-text-error">{form.err.fetch}</div>
          </Show>

          <Show when={!apiKeyOnly()}>
            <Button
              type="button"
              size="large"
              variant="secondary"
              disabled={isFetching() || saveMutation.isPending}
              onClick={fetchModels}
            >
              {isFetching()
                ? language.t("provider.openaiCompatible.fetching")
                : language.t("provider.openaiCompatible.fetchModels")}
            </Button>
          </Show>

          <Show when={!apiKeyOnly() && hasFetched() && models().length > 0}>
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <label class="text-12-medium text-text-weak">
                  {language.t("provider.openaiCompatible.models.label")}
                </label>
                <div class="flex gap-2">
                  <Button type="button" size="small" variant="ghost" onClick={selectAll}>
                    {language.t("common.selectAll")}
                  </Button>
                  <Button type="button" size="small" variant="ghost" onClick={deselectAll}>
                    {language.t("common.deselectAll")}
                  </Button>
                </div>
              </div>

              <div class="max-h-48 overflow-y-auto border border-border-base rounded-lg">
                <For each={models()}>
                  {(model) => (
                    <label class="flex items-center gap-3 px-4 py-2 hover:bg-surface-raised-hover cursor-pointer border-b border-border-base last:border-0">
                      <input
                        type="checkbox"
                        checked={model.selected}
                        onChange={() => toggleModel(models().indexOf(model))}
                        class="size-4"
                      />
                      <div class="flex flex-col">
                        <span class="text-13-medium text-text-strong">{model.name}</span>
                        <span class="text-12-regular text-text-weak">{model.id}</span>
                      </div>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Button
            class="w-auto self-start"
            type="submit"
            size="large"
            variant="primary"
            disabled={
              saveMutation.isPending ||
              isFetching() ||
              (!apiKeyOnly() && !hasFetched() && !(compatible() === "anthropic" && form.modelID.trim()))
            }
          >
            {saveMutation.isPending
              ? language.t("common.saving")
              : isFetching()
                ? language.t("provider.openaiCompatible.fetching")
                : apiKeyOnly()
                  ? language.t("common.connect")
                  : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}
