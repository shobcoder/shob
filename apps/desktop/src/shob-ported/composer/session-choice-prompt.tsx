import { For, Show, createEffect, onMount, type JSX } from "solid-js"
import { Icon } from "@shob-ai/ui/icon"

export type SessionChoiceOption = {
  id: string
  label: string
  description?: string
  disabled?: boolean
  customValue?: string
  customPlaceholder?: string
  onCustomInput?: (value: string) => void
}

export type SessionChoiceKeyAction =
  | { type: "continue"; preventDefault: true }
  | { type: "dismiss"; preventDefault: true }
  | { type: "move"; delta: -1 | 1; preventDefault: true }
  | { type: "next"; preventDefault: true }
  | { type: "none"; preventDefault: boolean }
  | { type: "previous"; preventDefault: true }
  | { type: "select"; index: number; preventDefault: true }

export function resolveSessionChoiceKeyAction(input: {
  disabled?: boolean
  hasProgress?: boolean
  inTextInput?: boolean
  key: string
  nextDisabled?: boolean
  optionCount: number
  previousDisabled?: boolean
  shiftKey?: boolean
}): SessionChoiceKeyAction {
  if (input.key === "Escape") {
    return input.disabled ? { type: "none", preventDefault: true } : { type: "dismiss", preventDefault: true }
  }

  if (input.disabled) return { type: "none", preventDefault: true }

  if (input.inTextInput) {
    if (input.key === "Enter" && !input.shiftKey) return { type: "continue", preventDefault: true }
    return { type: "none", preventDefault: false }
  }

  if (/^[1-9]$/.test(input.key)) {
    const index = Number(input.key) - 1
    if (index < input.optionCount) return { type: "select", index, preventDefault: true }
    return { type: "none", preventDefault: false }
  }

  if (input.key === "ArrowDown") return { type: "move", delta: 1, preventDefault: true }
  if (input.key === "ArrowUp") return { type: "move", delta: -1, preventDefault: true }

  if (input.key === "ArrowLeft" && input.hasProgress && !input.previousDisabled) {
    return { type: "previous", preventDefault: true }
  }

  if (input.key === "ArrowRight" && input.hasProgress && !input.nextDisabled) {
    return { type: "next", preventDefault: true }
  }

  if (input.key === "Enter") return { type: "continue", preventDefault: true }

  return { type: "none", preventDefault: false }
}

export function SessionChoicePrompt(props: {
  title: string
  options: SessionChoiceOption[]
  selectedIds: string[]
  activeIndex: number
  disabled?: boolean
  details?: JSX.Element
  progress?: {
    current: number
    total: number
    onPrevious: () => void
    onNext: () => void
    previousDisabled?: boolean
    nextDisabled?: boolean
  }
  dismissLabel?: string
  continueLabel?: string
  continueDisabled?: boolean
  onActiveIndexChange: (index: number) => void
  onSelect: (id: string, index: number) => void
  onDismiss: () => void
  onContinue: () => void
}) {
  let root: HTMLDivElement | undefined
  let customInput: HTMLTextAreaElement | undefined

  const dismissLabel = () => props.dismissLabel ?? "Dismiss"
  const continueLabel = () => props.continueLabel ?? "Continue"
  const disabled = () => props.disabled === true
  const selected = (id: string) => props.selectedIds.includes(id)
  const canContinue = () => !disabled() && props.continueDisabled !== true

  const clamp = (index: number) => {
    if (props.options.length === 0) return 0
    return Math.min(Math.max(index, 0), props.options.length - 1)
  }

  const move = (delta: number) => {
    if (props.options.length === 0) return
    props.onActiveIndexChange(clamp(props.activeIndex + delta))
  }

  const selectIndex = (index: number) => {
    const next = props.options[index]
    if (!next || next.disabled || disabled()) return
    props.onActiveIndexChange(index)
    props.onSelect(next.id, index)
  }

  const submit = () => {
    if (!canContinue()) return
    props.onContinue()
  }

  const keydown: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent> = (event) => {
    const target = event.target
    const inTextInput =
      target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement

    const action = resolveSessionChoiceKeyAction({
      disabled: disabled(),
      hasProgress: props.progress !== undefined,
      inTextInput,
      key: event.key,
      nextDisabled: props.progress?.nextDisabled,
      optionCount: props.options.length,
      previousDisabled: props.progress?.previousDisabled,
      shiftKey: event.shiftKey,
    })

    if (action.preventDefault) event.preventDefault()

    switch (action.type) {
      case "continue":
        submit()
        break
      case "dismiss":
        props.onDismiss()
        break
      case "move":
        move(action.delta)
        break
      case "next":
        props.progress?.onNext()
        break
      case "previous":
        props.progress?.onPrevious()
        break
      case "select":
        selectIndex(action.index)
        break
    }
  }

  onMount(() => {
    root?.focus()
  })

  createEffect(() => {
    const active = props.options[props.activeIndex]
    if (active?.customValue === undefined) return
    if (!selected(active.id)) return
    queueMicrotask(() => customInput?.focus())
  })

  return (
    <div
      data-component="session-choice-prompt"
      tabindex="0"
      ref={root}
      onKeyDown={keydown}
      aria-label={props.title}
    >
      <div data-slot="choice-header">
        <div data-slot="choice-title">{props.title}</div>
        <Show when={props.progress}>
          {(progress) => (
            <div data-slot="choice-progress">
              <button
                type="button"
                data-slot="choice-progress-button"
                disabled={disabled() || progress().previousDisabled}
                onClick={progress().onPrevious}
                aria-label="Previous question"
              >
                <Icon name="chevron-left" size="small" />
              </button>
              <span data-slot="choice-progress-count">
                {progress().current} of {progress().total}
              </span>
              <button
                type="button"
                data-slot="choice-progress-button"
                disabled={disabled() || progress().nextDisabled}
                onClick={progress().onNext}
                aria-label="Next question"
              >
                <Icon name="chevron-right" size="small" />
              </button>
            </div>
          )}
        </Show>
      </div>

      <Show when={props.details}>
        <div data-slot="choice-details">{props.details}</div>
      </Show>

      <div data-slot="choice-options">
        <For each={props.options}>
          {(option, index) => {
            const active = () => props.activeIndex === index()
            const picked = () => selected(option.id)
            const customOpen = () => option.customValue !== undefined && picked()
            return (
              <div
                data-slot="choice-option"
                data-active={active()}
                data-picked={picked()}
                data-custom-open={customOpen()}
                data-disabled={disabled() || option.disabled}
                role="button"
                aria-disabled={disabled() || option.disabled}
                aria-pressed={picked()}
                onMouseEnter={() => props.onActiveIndexChange(index())}
                onClick={() => selectIndex(index())}
              >
                <span data-slot="choice-option-index">{index() + 1}.</span>
                <span data-slot="choice-option-main">
                  <span data-slot="choice-option-label-row">
                    <span data-slot="choice-option-label">{option.label}</span>
                    <Show when={option.description}>
                      <span data-slot="choice-option-info" aria-hidden="true">
                        i
                      </span>
                    </Show>
                  </span>
                  <Show when={option.description}>
                    <span data-slot="choice-option-description">{option.description}</span>
                  </Show>
                  <Show when={customOpen()}>
                    <textarea
                      ref={customInput}
                      data-slot="choice-custom-input"
                      value={option.customValue}
                      placeholder={option.customPlaceholder}
                      disabled={disabled()}
                      rows={2}
                      onClick={(event) => event.stopPropagation()}
                      onInput={(event) => option.onCustomInput?.(event.currentTarget.value)}
                    />
                  </Show>
                </span>
                <span data-slot="choice-option-state">
                  <Show
                    when={picked()}
                    fallback={
                      <Show when={active()}>
                        <span data-slot="choice-option-arrows" aria-hidden="true">
                          <span data-slot="choice-option-arrow" data-direction="up">
                            <Icon name="chevron-down" size="small" />
                          </span>
                          <span data-slot="choice-option-arrow">
                            <Icon name="chevron-down" size="small" />
                          </span>
                        </span>
                      </Show>
                    }
                  >
                    <span data-slot="choice-option-picked" aria-label="Selected">
                      <Icon name="check" size="small" />
                    </span>
                  </Show>
                </span>
              </div>
            )
          }}
        </For>
      </div>

      <div data-slot="choice-footer">
        <button type="button" data-slot="choice-dismiss" disabled={disabled()} onClick={props.onDismiss}>
          {dismissLabel()}
        </button>
        <span data-slot="choice-key">ESC</span>
        <button type="button" data-slot="choice-continue" disabled={!canContinue()} onClick={submit}>
          <span>{continueLabel()}</span>
          <Icon name="enter" size="small" />
        </button>
      </div>
    </div>
  )
}
