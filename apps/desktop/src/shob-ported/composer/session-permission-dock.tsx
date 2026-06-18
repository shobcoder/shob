import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import type { PermissionRequest } from "@shob-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { SessionChoicePrompt, type SessionChoiceOption } from "./session-choice-prompt"

export type PermissionDecision = "once" | "always" | "reject"

export function permissionDecisionFromChoice(id: string): PermissionDecision | undefined {
  if (id === "once" || id === "always" || id === "reject") return id
  return undefined
}

export function buildPermissionChoiceOptions(labels: {
  allowAlways: string
  allowOnce: string
  deny: string
}): SessionChoiceOption[] {
  return [
    {
      id: "once",
      label: `${labels.allowOnce} (Recommended)`,
      description: "Approve this permission request one time.",
    },
    {
      id: "always",
      label: labels.allowAlways,
      description: "Approve future requests that match this permission pattern.",
    },
    {
      id: "reject",
      label: labels.deny,
      description: "Reject this request and leave the action blocked.",
    },
  ]
}

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: PermissionDecision) => void
}) {
  const language = useLanguage()
  const [selected, setSelected] = createSignal<PermissionDecision>("once")
  const [activeIndex, setActiveIndex] = createSignal(0)

  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return ""
    return value
  }

  const options = createMemo<SessionChoiceOption[]>(() =>
    buildPermissionChoiceOptions({
      allowAlways: language.t("ui.permission.allowAlways"),
      allowOnce: language.t("ui.permission.allowOnce"),
      deny: language.t("ui.permission.deny"),
    }),
  )

  const details = createMemo<JSX.Element>(() => (
    <>
      <Show when={toolDescription()}>
        <p>{toolDescription()}</p>
      </Show>
      <Show when={props.request.patterns.length > 0}>
        <div data-slot="choice-patterns">
          <For each={props.request.patterns}>{(pattern) => <code>{pattern}</code>}</For>
        </div>
      </Show>
    </>
  ))

  const select = (id: string, index: number) => {
    if (props.responding) return
    const decision = permissionDecisionFromChoice(id)
    if (!decision) return
    setSelected(decision)
    setActiveIndex(index)
  }

  return (
    <SessionChoicePrompt
      title={language.t("notification.permission.title")}
      options={options()}
      selectedIds={[selected()]}
      activeIndex={activeIndex()}
      disabled={props.responding}
      details={details()}
      dismissLabel={language.t("ui.common.dismiss")}
      onActiveIndexChange={setActiveIndex}
      onSelect={select}
      onDismiss={() => props.onDecide("reject")}
      onContinue={() => props.onDecide(selected())}
    />
  )
}
