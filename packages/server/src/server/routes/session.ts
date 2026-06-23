import { Hono } from "hono"
import { stream } from "hono/streaming"
import { describeRoute, validator, resolver } from "hono-openapi"
import { SessionID, MessageID, PartID } from "@/session/schema"
import z from "zod"
import { Session } from "../../session"
import { MessageV2 } from "../../session/message-v2"
import { SessionPrompt } from "../../session/prompt"
import { SessionRunState } from "@/session/run-state"
import { SessionCompaction } from "../../session/compaction"
import { SessionRevert } from "../../session/revert"
import { SessionShare } from "@/share/session"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "../../session/todo"
import { AppRuntime } from "../../effect/app-runtime"
import { Agent } from "../../agent/agent"
import { Snapshot } from "@/snapshot"
import { Command } from "../../command"
import { Log } from "../../util/log"
import { Permission } from "@/permission"
import { PermissionID } from "@/permission/schema"
import { ModelID, ProviderID } from "@/provider/schema"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Bus } from "../../bus"
import { NamedError } from "@shob-ai/util/error"
import { LLM } from "../../session/llm"
import type { Provider } from "@/provider/provider"
import { Config } from "@/config/config"
import { ProviderTransform } from "@/provider/transform"
import { Plugin } from "@/plugin"
import { SystemPrompt } from "../../session/system"
import { Instruction } from "../../session/instruction"
import { MessageV2 as MessageV2Session } from "../../session/message-v2"
import { ToolRegistry } from "@/tool/registry"
import { MCP } from "../../mcp"
import { Permission as PermService } from "@/permission"
import { mergeDeep, pipe } from "remeda"
import { streamText, type ModelMessage, type Tool } from "ai"
import { Auth } from "../../auth"
import { Instance } from "@/project/instance"
import { Flag } from "@/flag/flag"
import { Installation } from "@/installation"
import { ulid, PartID as PartIDUtil } from "ulid"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { Cause, Effect } from "effect"
import { wrapLanguageModel } from "ai"
import type { Server } from "bun"

const log = Log.create({ service: "server" })

async function streamAIResponse(
  sessionID: string,
  controller: ReadableStreamDirectController,
  encoder: TextEncoder,
): Promise<void> {
  // Track cleanup for client disconnect
  let isActive = true
  
  // Subscribe to session events for real-time streaming
  const unsubscribe = Bus.subscribeSession(sessionID, (event) => {
    if (!isActive) return
    
    try {
      // Forward session events to stream immediately
      controller.write(JSON.stringify({ type: "event", data: event.properties }) + "\n")
      controller.flush()
    } catch {
      // Stream closed by client
      isActive = false
    }
  })

  try {
    // Start the AI processing loop
    const result = await SessionPrompt.loop({ sessionID })

    // Send completion event
    if (isActive) {
      controller.write(JSON.stringify({ type: "complete", data: result }) + "\n")
      controller.flush()
    }
  } finally {
    isActive = false
    unsubscribe()
  }
}

async function streamTokensIncremental(
  sessionID: string,
  controller: ReadableStreamDirectController,
  encoder: TextEncoder,
  input: {
    messages: ModelMessage[]
    model: Provider.Model
    agent: Agent.Info
    system?: string[]
    tools?: Record<string, Tool>
  },
): Promise<void> {
  // Parallel fetch for faster initialization
  const [language, cfg, provider, auth] = await Promise.all([
    Provider.getLanguage(input.model),
    Config.get(),
    Provider.getProvider(input.model.providerID),
    Auth.get(input.model.providerID),
  ])

  const isOpenaiOauth = provider.id === "openai" && auth?.type === "oauth"

  // Build system prompt
  const system: string[] = []
  system.push(
    [
      ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
      ...(input.system ?? []),
    ]
      .filter((x) => x)
      .join("\n"),
  )

  // Build messages
  const messages = isOpenaiOauth
    ? input.messages
    : [
        ...system.map(
          (x): ModelMessage => ({
            role: "system",
            content: x,
          }),
        ),
        ...input.messages,
      ]

  // Build options
  const base = ProviderTransform.options({
    model: input.model,
    sessionID,
    providerOptions: provider.options,
  })
  const options: Record<string, any> = pipe(
    base,
    mergeDeep(input.model.options),
    mergeDeep(input.agent.options),
  )

  // Stream tokens as they arrive - this is the key optimization
  const result = streamText({
    model: wrapLanguageModel({
      model: language,
      middleware: [
        {
          specificationVersion: "v3" as const,
          async transformParams(args) {
            if (args.type === "stream") {
              // @ts-expect-error
              args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)
            }
            return args.params
          },
        },
      ],
    }),
    messages,
    tools: input.tools ?? {},
    temperature: input.model.capabilities.temperature
      ? input.agent.temperature ?? ProviderTransform.temperature(input.model)
      : undefined,
    topP: input.agent.topP ?? ProviderTransform.topP(input.model),
    topK: ProviderTransform.topK(input.model),
    maxOutputTokens: ProviderTransform.maxOutputTokens(input.model),
    providerOptions: ProviderTransform.providerOptions(input.model, options),
    abortSignal: new AbortController().signal,
    headers: {
      "x-session-affinity": sessionID,
      "User-Agent": `shob/${Installation.VERSION}`,
      ...input.model.headers,
    },
    experimental_telemetry: {
      isEnabled: cfg.experimental?.openTelemetry,
      metadata: {
        userId: cfg.username ?? "unknown",
        sessionId: sessionID,
      },
    },
  })

  let chunkCount = 0
  
  // Stream each token as it arrives - zero buffering
  for await (const event of result.fullStream) {
    const eventData = {
      type: event.type,
      ...("textDelta" in event && { delta: event.textDelta }),
      ...("reasoningDelta" in event && { reasoningDelta: event.reasoningDelta }),
      ...("toolCall" in event && { toolCall: event.toolCall }),
      ...("toolResult" in event && { toolResult: event.toolResult }),
      ...("usage" in event && { usage: event.usage }),
      ...("finishReason" in event && { finishReason: event.finishReason }),
    }

    try {
      // Write directly and flush immediately for real-time streaming
      controller.write(JSON.stringify(eventData) + "\n")
      controller.flush()
      
      // 🚀 Yield to event loop every 50 chunks to prevent blocking
      chunkCount++
      if (chunkCount % 50 === 0) {
        await Bun.sleep(0) // Gives event loop a chance to process other tasks
      }
    } catch {
      // Stream closed by client
      break
    }
  }
}

function createSSEStream(
  sessionID: string,
  onData: (controller: ReadableStreamDirectController) => Promise<void>,
): Response {
  // Get the Bun server instance for timeout configuration
  // In Hono context, we use the c.env to access server
  return new Response(
    new ReadableStream({
      type: "direct",
      async pull(controller: ReadableStreamDirectController) {
        try {
          await onData(controller)
          controller.close()
        } catch (error) {
          // Proper error handling - use controller.error() instead of close()
          if (error instanceof Error) {
            controller.error(error)
          } else {
            controller.error(new Error(String(error)))
          }
        }
      },
      cancel() {
        // 🚀 CRITICAL: Cleanup when client disconnects
        // This prevents memory leaks and CPU cycles from leaked connections
        SessionPrompt.cancel(sessionID).catch(() => {
          log.warn("Failed to cancel session on disconnect", { sessionID })
        })
      },
    }),
    {
      headers: {
        // SSE requires these headers for proper operation
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        // Prevent proxies/CDNs from buffering
        "X-Accel-Buffering": "no",
        // Allow cross-origin requests
        "Access-Control-Allow-Origin": "*",
        // Don't compress SSE (causes issues)
        "X-Content-Type-Options": "nosniff",
      },
    },
  )
}

function createOptimizedStream(
  dataGenerator: (controller: ReadableStreamDirectController) => AsyncGenerator<string>,
): Response {
  const encoder = new TextEncoder()
  
  return new Response(
    new ReadableStream({
      type: "direct",
      highWaterMark: 64 * 1024, // 64KB - optimal for network MTU
      
      async pull(controller: ReadableStreamDirectController) {
        try {
          for await (const data of dataGenerator(controller)) {
            // Write and flush immediately for real-time streaming
            controller.write(encoder.encode(data))
            controller.flush()
            
            // Yield periodically to prevent blocking the event loop
            await Bun.sleep(0)
          }
          controller.close()
        } catch (error) {
          if (error instanceof Error) {
            controller.error(error)
          } else {
            controller.error(new Error(String(error)))
          }
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson",
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
        Connection: "keep-alive",
      },
    },
  )
}

export const SessionRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List sessions",
        description: "Get a list of all Shob sessions, sorted by most recently updated.",
        operationId: "session.list",
        responses: {
          200: {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional().meta({ description: "Filter sessions by project directory" }),
          roots: z.coerce.boolean().optional().meta({ description: "Only return root sessions (no parentID)" }),
          start: z.coerce
            .number()
            .optional()
            .meta({ description: "Filter sessions updated on or after this timestamp (milliseconds since epoch)" }),
          search: z.string().optional().meta({ description: "Filter sessions by title (case-insensitive)" }),
          limit: z.coerce.number().optional().meta({ description: "Maximum number of sessions to return" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const sessions: Session.Info[] = []
        for await (const session of Session.list({
          directory: query.directory,
          roots: query.roots,
          start: query.start,
          search: query.search,
          limit: query.limit,
        })) {
          sessions.push(session)
        }
        return c.json(sessions)
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Get session status",
        description: "Retrieve the current status of all sessions, including active, idle, and completed states.",
        operationId: "session.status",
        responses: {
          200: {
            description: "Get session status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), SessionStatus.Info)),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const result = await AppRuntime.runPromise(SessionStatus.Service.use((svc) => svc.list()))
        return c.json(Object.fromEntries(result))
      },
    )
    .get(
      "/:sessionID",
      describeRoute({
        summary: "Get session",
        description: "Retrieve detailed information about a specific Shob session.",
        tags: ["Session"],
        operationId: "session.get",
        responses: {
          200: {
            description: "Get session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.get.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/children",
      describeRoute({
        summary: "Get session children",
        tags: ["Session"],
        description: "Retrieve all child sessions that were forked from the specified parent session.",
        operationId: "session.children",
        responses: {
          200: {
            description: "List of children",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.children.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await Session.children(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/todo",
      describeRoute({
        summary: "Get session todos",
        description: "Retrieve the todo list associated with a specific session, showing tasks and action items.",
        operationId: "session.todo",
        responses: {
          200: {
            description: "Todo list",
            content: {
              "application/json": {
                schema: resolver(Todo.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const todos = await AppRuntime.runPromise(Todo.Service.use((svc) => svc.get(sessionID)))
        return c.json(todos)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create session",
        description: "Create a new Shob session for interacting with AI assistants and managing conversations.",
        operationId: "session.create",
        responses: {
          ...errors(400),
          200: {
            description: "Successfully created session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator("json", Session.create.schema),
      async (c) => {
        const body = c.req.valid("json") ?? {}
        const session = await SessionShare.create(body)
        return c.json(session)
      },
    )
    .delete(
      "/:sessionID",
      describeRoute({
        summary: "Delete session",
        description: "Delete a session and permanently remove all associated data, including messages and history.",
        operationId: "session.delete",
        responses: {
          200: {
            description: "Successfully deleted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.remove.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.remove(sessionID)
        return c.json(true)
      },
    )
    .patch(
      "/:sessionID",
      describeRoute({
        summary: "Update session",
        description: "Update properties of an existing session, such as title or other metadata.",
        operationId: "session.update",
        responses: {
          200: {
            description: "Successfully updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator(
        "json",
        z.object({
          title: z.string().optional(),
          time: z
            .object({
              archived: z.number().optional(),
            })
            .optional(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const updates = c.req.valid("json")

        if (updates.title !== undefined) {
          await Session.setTitle({ sessionID, title: updates.title })
        }
        if (updates.time?.archived !== undefined) {
          await Session.setArchived({ sessionID, time: updates.time.archived })
        }

        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    // TODO(v2): remove this dedicated route and rely on the normal `/init` command flow.
    .post(
      "/:sessionID/init",
      describeRoute({
        summary: "Initialize session",
        description:
          "Analyze the current application and create an AGENTS.md file with project-specific agent configurations.",
        operationId: "session.init",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator(
        "json",
        z.object({
          modelID: ModelID.zod,
          providerID: ProviderID.zod,
          messageID: MessageID.zod,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        await SessionPrompt.command({
          sessionID,
          messageID: body.messageID,
          model: body.providerID + "/" + body.modelID,
          command: Command.Default.INIT,
          arguments: "",
        })
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/fork",
      describeRoute({
        summary: "Fork session",
        description: "Create a new session by forking an existing session at a specific message point.",
        operationId: "session.fork",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.fork.schema.shape.sessionID,
        }),
      ),
      validator("json", Session.fork.schema.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const result = await Session.fork({ ...body, sessionID })
        return c.json(result)
      },
    )
    .post(
      "/:sessionID/abort",
      describeRoute({
        summary: "Abort session",
        description: "Abort an active session and stop any ongoing AI processing or command execution.",
        operationId: "session.abort",
        responses: {
          200: {
            description: "Aborted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      async (c) => {
        await SessionPrompt.cancel(c.req.valid("param").sessionID)
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/share",
      describeRoute({
        summary: "Share session",
        description: "Create a shareable link for a session, allowing others to view the conversation.",
        operationId: "session.share",
        responses: {
          200: {
            description: "Successfully shared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await SessionShare.share(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/diff",
      describeRoute({
        summary: "Get message diff",
        description: "Get the file changes (diff) that resulted from a specific user message in the session.",
        operationId: "session.diff",
        responses: {
          200: {
            description: "Successfully retrieved diff",
            content: {
              "application/json": {
                schema: resolver(Snapshot.FileDiff.array()),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionSummary.DiffInput.shape.sessionID,
        }),
      ),
      validator(
        "query",
        z.object({
          messageID: SessionSummary.DiffInput.shape.messageID,
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const params = c.req.valid("param")
        const result = await SessionSummary.diff({
          sessionID: params.sessionID,
          messageID: query.messageID,
        })
        return c.json(result)
      },
    )
    .delete(
      "/:sessionID/share",
      describeRoute({
        summary: "Unshare session",
        description: "Remove the shareable link for a session, making it private again.",
        operationId: "session.unshare",
        responses: {
          200: {
            description: "Successfully unshared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await SessionShare.unshare(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/summarize",
      describeRoute({
        summary: "Summarize session",
        description: "Generate a concise summary of the session using AI compaction to preserve key information.",
        operationId: "session.summarize",
        responses: {
          200: {
            description: "Summarized session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator(
        "json",
        z.object({
          providerID: ProviderID.zod,
          modelID: ModelID.zod,
          auto: z.boolean().optional().default(false),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const session = await Session.get(sessionID)
        await SessionRevert.cleanup(session)
        const msgs = await Session.messages({ sessionID })
        let currentAgent = await Agent.defaultAgent()
        for (let i = msgs.length - 1; i >= 0; i--) {
          const info = msgs[i].info
          if (info.role === "user") {
            currentAgent = info.agent || (await Agent.defaultAgent())
            break
          }
        }
        await SessionCompaction.create({
          sessionID,
          agent: currentAgent,
          model: {
            providerID: body.providerID,
            modelID: body.modelID,
          },
          auto: body.auto,
        })
        await SessionPrompt.loop({ sessionID })
        return c.json(true)
      },
    )
    .get(
      "/:sessionID/message",
      describeRoute({
        summary: "Get session messages",
        description: "Retrieve all messages in a session, including user prompts and AI responses.",
        operationId: "session.messages",
        responses: {
          200: {
            description: "List of messages",
            content: {
              "application/json": {
                schema: resolver(MessageV2.WithParts.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator(
        "query",
        z
          .object({
            limit: z.coerce
              .number()
              .int()
              .min(0)
              .optional()
              .meta({ description: "Maximum number of messages to return" }),
            before: z
              .string()
              .optional()
              .meta({ description: "Opaque cursor for loading older messages" })
              .refine(
                (value) => {
                  if (!value) return true
                  try {
                    MessageV2.cursor.decode(value)
                    return true
                  } catch {
                    return false
                  }
                },
                { message: "Invalid cursor" },
              ),
          })
          .refine((value) => !value.before || value.limit !== undefined, {
            message: "before requires limit",
            path: ["before"],
          }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const sessionID = c.req.valid("param").sessionID
        if (query.limit === undefined) {
          await Session.get(sessionID)
          const messages = await Session.messages({ sessionID })
          return c.json(messages)
        }

        if (query.limit === 0) {
          await Session.get(sessionID)
          const messages = await Session.messages({ sessionID })
          return c.json(messages)
        }

        const page = await MessageV2.page({
          sessionID,
          limit: query.limit,
          before: query.before,
        })
        if (page.cursor) {
          const url = new URL(c.req.url)
          url.searchParams.set("limit", query.limit.toString())
          url.searchParams.set("before", page.cursor)
          c.header("Access-Control-Expose-Headers", "Link, X-Next-Cursor")
          c.header("Link", `<${url.toString()}>; rel=\"next\"`)
          c.header("X-Next-Cursor", page.cursor)
        }
        return c.json(page.items)
      },
    )
    .get(
      "/:sessionID/message/:messageID",
      describeRoute({
        summary: "Get message",
        description: "Retrieve a specific message from a session by its message ID.",
        operationId: "session.message",
        responses: {
          200: {
            description: "Message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Info,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
          messageID: MessageID.zod,
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const message = await MessageV2.get({
          sessionID: params.sessionID,
          messageID: params.messageID,
        })
        return c.json(message)
      },
    )
    .delete(
      "/:sessionID/message/:messageID",
      describeRoute({
        summary: "Delete message",
        description:
          "Permanently delete a specific message (and all of its parts) from a session. This does not revert any file changes that may have been made while processing the message.",
        operationId: "session.deleteMessage",
        responses: {
          200: {
            description: "Successfully deleted message",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
          messageID: MessageID.zod,
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await SessionRunState.assertNotBusy(params.sessionID)
        await Session.removeMessage({
          sessionID: params.sessionID,
          messageID: params.messageID,
        })
        return c.json(true)
      },
    )
    .delete(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Delete a part from a message",
        operationId: "part.delete",
        responses: {
          200: {
            description: "Successfully deleted part",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
          messageID: MessageID.zod,
          partID: PartID.zod,
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await Session.removePart({
          sessionID: params.sessionID,
          messageID: params.messageID,
          partID: params.partID,
        })
        return c.json(true)
      },
    )
    .patch(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Update a part in a message",
        operationId: "part.update",
        responses: {
          200: {
            description: "Successfully updated part",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Part),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
          messageID: MessageID.zod,
          partID: PartID.zod,
        }),
      ),
      validator("json", MessageV2.Part),
      async (c) => {
        const params = c.req.valid("param")
        const body = c.req.valid("json")
        if (body.id !== params.partID || body.messageID !== params.messageID || body.sessionID !== params.sessionID) {
          throw new Error(
            `Part mismatch: body.id='${body.id}' vs partID='${params.partID}', body.messageID='${body.messageID}' vs messageID='${params.messageID}', body.sessionID='${body.sessionID}' vs sessionID='${params.sessionID}'`,
          )
        }
        const part = await Session.updatePart(body)
        return c.json(part)
      },
    )
    .post(
      "/:sessionID/message",
      describeRoute({
        summary: "Send message",
        description: "Create and send a new message to a session, streaming the AI response.",
        operationId: "session.prompt",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        c.status(200)
        c.header("Content-Type", "application/json")
        return stream(c, async (stream) => {
          const sessionID = c.req.valid("param").sessionID
          const body = c.req.valid("json")
          const msg = await SessionPrompt.prompt({ ...body, sessionID })
          stream.write(JSON.stringify(msg))
        })
      },
    )
  
    .post(
      "/:sessionID/message/stream",
      describeRoute({
        summary: "Send message with native streaming (SSE)",
        description:
          "Create and send a new message to a session with native Bun SSE streaming for maximum performance. Streams tokens incrementally with all optimizations applied.",
        operationId: "session.prompt_stream",
        responses: {
          200: {
            description: "SSE stream of message events",
            content: {
              "text/event-stream": {
                schema: resolver(z.any()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const encoder = new TextEncoder()

        // Use createSSEStream helper for proper SSE with all fixes
        return createSSEStream(sessionID, async (controller: ReadableStreamDirectController) => {
          // 🚀 FIX 1: Send user message immediately (zero wait)
          const userMsg = await SessionPrompt.prompt({
            ...body,
            sessionID,
            noReply: true,
          })
          controller.write(JSON.stringify({ type: "user", data: userMsg }) + "\n")
          controller.flush()

          // 🚀 FIX 2: Stream AI response events as they arrive via Bus
          // This now uses direct mode with write() + flush()
          await streamAIResponse(sessionID, controller, encoder)
        })
      },
    )
    // Alternative endpoint using optimized direct mode for NDJSON
    .post(
      "/:sessionID/message/stream/ndjson",
      describeRoute({
        summary: "Send message with NDJSON streaming",
        description:
          "Create and send a new message with NDJSON streaming. Uses Bun's type:direct for maximum throughput with 64KB buffer optimization.",
        operationId: "session.prompt_stream_ndjson",
        responses: {
          200: {
            description: "NDJSON stream of message events",
            content: {
              "application/x-ndjson": {
                schema: resolver(z.any()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")

        // 🚀 Use optimized stream with 64KB buffer and direct mode
        return createOptimizedStream(async function* (controller: ReadableStreamDirectController) {
          // Send user message first
          const userMsg = await SessionPrompt.prompt({
            ...body,
            sessionID,
            noReply: true,
          })
          yield JSON.stringify({ type: "user", data: userMsg }) + "\n"

          // Subscribe to session events
          let isActive = true
          const unsubscribe = Bus.subscribe("*", (event) => {
            if (!isActive) return
            const properties = event.properties as Record<string, unknown>
            if (properties.sessionID === sessionID) {
              try {
                controller.write(JSON.stringify({ type: "event", data: properties }) + "\n")
                controller.flush()
              } catch {
                isActive = false
              }
            }
          })

          try {
            // Start the AI processing loop
            const result = await SessionPrompt.loop({ sessionID })
            yield JSON.stringify({ type: "complete", data: result }) + "\n"
          } finally {
            isActive = false
            unsubscribe()
          }
        })
      },
    )
    .post(
      "/:sessionID/prompt_async",
      describeRoute({
        summary: "Send async message",
        description:
          "Create and send a new message to a session asynchronously, starting the session if needed and returning immediately.",
        operationId: "session.prompt_async",
        responses: {
          204: {
            description: "Prompt accepted",
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        SessionPrompt.prompt({ ...body, sessionID }).catch((err) => {
          log.error("prompt_async failed", { sessionID, error: err })
          Bus.publish(Session.Event.Error, {
            sessionID,
            error: new NamedError.Unknown({ message: err instanceof Error ? err.message : String(err) }).toObject(),
          })
        })

        return c.body(null, 204)
      },
    )
    .post(
      "/:sessionID/command",
      describeRoute({
        summary: "Send command",
        description: "Send a new command to a session for execution by the AI assistant.",
        operationId: "session.command",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator("json", SessionPrompt.CommandInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.command({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/shell",
      describeRoute({
        summary: "Run shell command",
        description: "Execute a shell command within the session context and return the AI's response.",
        operationId: "session.shell",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(MessageV2.WithParts),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator("json", SessionPrompt.ShellInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.shell({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/revert",
      describeRoute({
        summary: "Revert message",
        description: "Revert a specific message in a session, undoing its effects and restoring the previous state.",
        operationId: "session.revert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator("json", SessionRevert.RevertInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        log.info("revert", c.req.valid("json"))
        const session = await SessionRevert.revert({
          sessionID,
          ...c.req.valid("json"),
        })
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/unrevert",
      describeRoute({
        summary: "Restore reverted messages",
        description: "Restore all previously reverted messages in a session.",
        operationId: "session.unrevert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await SessionRevert.unrevert({ sessionID })
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/permissions/:permissionID",
      describeRoute({
        summary: "Respond to permission",
        deprecated: true,
        description: "Approve or deny a permission request from the AI assistant.",
        operationId: "permission.respond",
        responses: {
          200: {
            description: "Permission processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
          permissionID: PermissionID.zod,
        }),
      ),
      validator("json", z.object({ response: Permission.Reply })),
      async (c) => {
        const params = c.req.valid("param")
        Permission.reply({
          requestID: params.permissionID,
          reply: c.req.valid("json").response,
        })
        return c.json(true)
      },
    ),
)
