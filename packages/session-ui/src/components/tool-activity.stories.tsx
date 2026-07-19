import type { ToolPart } from "@shob/sdk/v2"
import { BasicTool } from "./basic-tool"
import { ToolActivityGroup } from "./message-part"

const tool = (id: string, name: string): ToolPart => ({
  id,
  sessionID: "storybook-session",
  messageID: "storybook-message",
  type: "tool",
  callID: `call-${id}`,
  tool: name,
  state: {
    status: "completed",
    input: {},
    output: "",
    title: "",
    metadata: {},
    time: { start: 1, end: 2 },
  },
})

const command = tool("command", "bash")
const edit = tool("edit", "edit")
const search = tool("search", "websearch")

export default {
  title: "UI/Tool Activity Group",
  id: "components-tool-activity-group",
  component: ToolActivityGroup,
}

export const CommandsAndWeb = {
  render: () => (
    <div style={{ width: "720px", padding: "24px", background: "var(--v2-background-bg-base)" }}>
      <ToolActivityGroup parts={[command, search]}>
        <BasicTool activityItem icon="terminal" trigger={{ title: "Ran", subtitle: "bun typecheck" }}>
          <pre>$ bun typecheck{"\n"}Checked 0 errors</pre>
        </BasicTool>
        <BasicTool
          activityItem
          icon="window-cursor"
          trigger={{ title: "Searched the web", subtitle: "SolidJS collapsible" }}
        />
      </ToolActivityGroup>
    </div>
  ),
}

export const EditsAndCommand = {
  render: () => (
    <div style={{ width: "720px", padding: "24px", background: "var(--v2-background-bg-base)" }}>
      <ToolActivityGroup parts={[edit, edit, command]}>
        <BasicTool activityItem icon="pencil-line" trigger={{ title: "Edited", subtitle: "message-part.tsx" }} />
        <BasicTool activityItem icon="pencil-line" trigger={{ title: "Edited", subtitle: "message-part.css" }} />
        <BasicTool activityItem icon="terminal" trigger={{ title: "Ran", subtitle: "git diff --check" }} />
      </ToolActivityGroup>
    </div>
  ),
}
