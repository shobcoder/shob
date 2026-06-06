import { createEffect, createSignal, For, Match, on, onCleanup, onMount, Show, Switch, type JSX } from "solid-js"
import { animate, type AnimationPlaybackControls } from "motion"
import { useI18n } from "../context/i18n"
import { createStore } from "solid-js/store"
import { Collapsible } from "./collapsible"
import { Icon, type IconProps } from "./icon"
import { Spinner } from "./spinner"
import { TextShimmer } from "./text-shimmer"
import { FileIcon } from "./file-icon"

export type TriggerTitle = {
  title: string
  titleClass?: string
  subtitle?: string
  subtitleClass?: string
  args?: string[]
  argsClass?: string
  action?: JSX.Element
}

const isTriggerTitle = (val: any): val is TriggerTitle => {
  return (
    typeof val === "object" && val !== null && "title" in val && (typeof Node === "undefined" || !(val instanceof Node))
  )
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export interface BasicToolProps {
  icon: IconProps["name"]
  trigger: TriggerTitle | JSX.Element
  children?: JSX.Element
  status?: string
  durationMs?: number
  hideDetails?: boolean
  defaultOpen?: boolean
  forceOpen?: boolean
  defer?: boolean
  locked?: boolean
  animated?: boolean
  onSubtitleClick?: () => void
  onTriggerClick?: JSX.EventHandlerUnion<HTMLElement, MouseEvent>
  triggerHref?: string
  clickable?: boolean
  filePath?: string
  additions?: number
  deletions?: number
}

const SPRING = { type: "spring" as const, visualDuration: 0.35, bounce: 0 }

const DOTS_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

function DotsSpinner(props: { class?: string }) {
  const [frame, setFrame] = createSignal(0)
  let timer: number | undefined

  onMount(() => {
    timer = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % DOTS_FRAMES.length)
    }, 80)
  })

  onCleanup(() => {
    if (timer) window.clearInterval(timer)
  })

  return (
    <span class={props.class} aria-hidden="true">
      {DOTS_FRAMES[frame()]}
    </span>
  )
}

export function BasicTool(props: BasicToolProps) {
  const [state, setState] = createStore({
    open: props.defaultOpen ?? false,
    ready: props.defaultOpen ?? false,
    seen: false,
  })
  const open = () => state.open
  const ready = () => state.ready
  const seen = () => state.seen
  const pending = () => props.status === "pending" || props.status === "running"

  let frame: number | undefined

  const cancel = () => {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
    frame = undefined
  }

  onCleanup(cancel)

  createEffect(() => {
    if (props.forceOpen) setState("open", true)
  })

  createEffect(
    on(
      pending,
      (active) => {
        if (active) {
          if (!seen()) setState("seen", true)
          if (!open()) setState("open", true)
        }
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      open,
      (value) => {
        if (!props.defer) return
        if (!value) {
          cancel()
          setState("ready", false)
          return
        }

        cancel()
        frame = requestAnimationFrame(() => {
          frame = undefined
          if (!open()) return
          setState("ready", true)
        })
      },
      { defer: true },
    ),
  )

  // Animated height for collapsible open/close
  let contentRef: HTMLDivElement | undefined
  let heightAnim: AnimationPlaybackControls | undefined
  const initialOpen = open()

  createEffect(
    on(
      open,
      (isOpen) => {
        if (!props.animated || !contentRef) return
        heightAnim?.stop()
        if (isOpen) {
          contentRef.style.display = "block"
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "auto" }, SPRING)
          heightAnim.finished.then(() => {
            if (!contentRef || !open()) return
            contentRef.style.overflow = "visible"
            contentRef.style.height = "auto"
          })
        } else {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "0px" }, SPRING)
          heightAnim.finished.then(() => {
            if (!contentRef || open()) return
            contentRef.style.display = "none"
          })
        }
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    heightAnim?.stop()
  })

  const handleOpenChange = (value: boolean) => {
    if (props.locked && !value) return
    setState("open", value)
  }

  const trigger = () => (
    <div
      data-component="tool-trigger"
      data-status={props.status ?? "completed"}
      data-clickable={props.clickable ? "true" : undefined}
      data-hide-details={props.hideDetails ? "true" : undefined}
    >
      <Show when={pending()} fallback={
        <span data-slot="basic-tool-tool-indicator">
          <Icon name={props.icon} size="small" />
        </span>
      }>
        <span data-slot="basic-tool-tool-spinner">
          <DotsSpinner class="text-[14px] leading-none text-icon-interactive-base font-mono" />
        </span>
      </Show>
      <div data-slot="basic-tool-tool-trigger-content">
        <div data-slot="basic-tool-tool-info">
          <Switch>
            <Match when={isTriggerTitle(props.trigger) && props.trigger}>
              {(title) => (
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <span
                      data-slot="basic-tool-tool-title"
                      classList={{
                        [title().titleClass ?? ""]: !!title().titleClass,
                      }}
                    >
                      <TextShimmer text={title().title} active={pending()} />
                    </span>
                    <Show when={title().subtitle}>
                      <span
                        data-slot="basic-tool-tool-subtitle"
                        classList={{
                          [title().subtitleClass ?? ""]: !!title().subtitleClass,
                          clickable: !!props.onSubtitleClick,
                          "opacity-60": pending(),
                        }}
                        onClick={(e) => {
                          if (props.onSubtitleClick) {
                            e.stopPropagation()
                            props.onSubtitleClick()
                          }
                        }}
                      >
                        <Show when={props.filePath}>
                          <span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-right: 2px; flex-shrink: 0;">
                            <FileIcon node={{ path: props.filePath!, type: "file" }} />
                          </span>
                        </Show>
                        {title().subtitle}
                      </span>
                    </Show>
                    <Show when={props.additions !== undefined || props.deletions !== undefined}>
                      <span
                        data-slot="basic-tool-diff-stats"
                        style="display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; font-family: var(--font-family-mono); font-size: 12px; font-weight: 500;"
                      >
                        <Show when={props.additions !== undefined && props.additions > 0}>
                          <span data-slot="basic-tool-diff-additions">+{props.additions}</span>
                        </Show>
                        <Show when={props.deletions !== undefined && props.deletions > 0}>
                          <span data-slot="basic-tool-diff-deletions">-{props.deletions}</span>
                        </Show>
                      </span>
                    </Show>
                    <Show when={title().args?.length}>
                      <For each={title().args}>
                        {(arg) => (
                          <span
                            data-slot="basic-tool-tool-arg"
                            classList={{
                              [title().argsClass ?? ""]: !!title().argsClass,
                              "opacity-60": pending(),
                            }}
                          >
                            {arg}
                          </span>
                        )}
                      </For>
                    </Show>
                  </div>
                  <Show when={!pending() && title().action}>
                    <span data-slot="basic-tool-tool-action">{title().action}</span>
                  </Show>
                </div>
              )}
            </Match>
            <Match when={true}>{props.trigger as JSX.Element}</Match>
          </Switch>
        </div>
      </div>

      <Show 
        when={props.children && !props.hideDetails && !props.locked}
        fallback={<div style={{ width: "24px", height: "24px", "flex-shrink": 0 }} />}
      >
        <Collapsible.Arrow />
      </Show>
      <Show when={pending()}>
        <span data-slot="basic-tool-running-progress" />
      </Show>
    </div>
  )

  return (
    <Collapsible
      open={open()}
      onOpenChange={handleOpenChange}
      class="tool-collapsible"
      data-status={props.status ?? "completed"}
    >
      <Show
        when={props.triggerHref}
        fallback={
          <Collapsible.Trigger
            data-hide-details={props.hideDetails ? "true" : undefined}
            onClick={props.onTriggerClick}
          >
            {trigger()}
          </Collapsible.Trigger>
        }
      >
        {(href) => (
          <Collapsible.Trigger
            as="a"
            href={href()}
            data-hide-details={props.hideDetails ? "true" : undefined}
            onClick={props.onTriggerClick}
          >
            {trigger()}
          </Collapsible.Trigger>
        )}
      </Show>
      <Show when={props.animated && props.children && !props.hideDetails}>
        <div
          ref={contentRef}
          data-slot="collapsible-content"
          data-animated
          style={{
            height: initialOpen ? "auto" : "0px",
            overflow: initialOpen ? "visible" : "hidden",
            display: initialOpen ? "block" : "none",
          }}
        >
          {props.children}
        </div>
      </Show>
      <Show when={!props.animated && props.children && !props.hideDetails}>
        <Collapsible.Content>
          <Show when={!props.defer || ready()}>{props.children}</Show>
        </Collapsible.Content>
      </Show>
    </Collapsible>
  )
}

function label(input: Record<string, unknown> | undefined) {
  const keys = ["description", "query", "url", "filePath", "path", "pattern", "name"]
  return keys.map((key) => input?.[key]).find((value): value is string => typeof value === "string" && value.length > 0)
}

function args(input: Record<string, unknown> | undefined) {
  if (!input) return []
  const skip = new Set(["description", "query", "url", "filePath", "path", "pattern", "name"])
  return Object.entries(input)
    .filter(([key]) => !skip.has(key))
    .flatMap(([key, value]) => {
      if (typeof value === "string") return [`${key}=${value}`]
      if (typeof value === "number") return [`${key}=${value}`]
      if (typeof value === "boolean") return [`${key}=${value}`]
      return []
    })
    .slice(0, 3)
}

export function GenericTool(props: {
  tool: string
  status?: string
  hideDetails?: boolean
  input?: Record<string, unknown>
}) {
  const i18n = useI18n()

  return (
    <BasicTool
      icon="mcp"
      status={props.status}
      trigger={{
        title: i18n.t("ui.basicTool.called", { tool: props.tool }),
        subtitle: label(props.input),
        args: args(props.input),
      }}
      hideDetails={props.hideDetails}
    />
  )
}
