import type { Todo } from "@shob-ai/sdk/v2/client"
import { For, Show, createMemo } from "solid-js"
import { DockTray } from "@shob-ai/ui/dock-surface"
import { ChevronDown } from "lucide-solid"

export function SessionTodoDock(props: {
  todos: Todo[]
  collapsed: boolean
  onToggle: () => void
  collapseLabel: string
  expandLabel: string
}) {
  const displayedTodos = createMemo(() => {
    if (props.collapsed) return []
    return props.todos
  })
  const toggleLabel = createMemo(() => (props.collapsed ? props.expandLabel : props.collapseLabel))

  return (
    <DockTray data-component="session-todo-dock" class="todo-dock" data-collapsed={props.collapsed ? "true" : "false"}>
      <div
        data-action="session-todo-toggle"
        class="todo-dock-header"
        role="button"
        tabIndex={0}
        aria-expanded={!props.collapsed}
        aria-label={toggleLabel()}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          props.onToggle()
        }}
      >
        <span class="todo-dock-title">Progress</span>
        <ChevronDown class="todo-dock-toggle-icon" size={14} aria-hidden="true" />
      </div>

      <Show when={displayedTodos().length > 0}>
        <div class="todo-dock-list" aria-live="polite">
          <For each={displayedTodos()}>
            {(todo) => (
              <div class="todo-dock-item" data-status={todo.status} aria-current={todo.status === "in_progress" ? "step" : undefined}>
                <span class="todo-dock-status" role="img" aria-label={todoStatusLabel(todo.status)} />
                <span class="todo-dock-item-text">{todo.content}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </DockTray>
  )
}

function todoStatusLabel(status: Todo["status"]) {
  switch (status) {
    case "completed":
      return "Completed"
    case "in_progress":
      return "In progress"
    case "cancelled":
      return "Cancelled"
    default:
      return "Pending"
  }
}

