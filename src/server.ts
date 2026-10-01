import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool
} from "ai";
import { z } from "zod";

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  chatRecovery = true;
  // Wait for MCP connections to be re-established after hibernation before
  // processing a message, so MCP tools aren't intermittently missing.
  waitForMcpConnections = true;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/google/gemma-4-26b-a4b-it", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are CloudMigrate AI, an AI-powered database migration copilot built on Cloudflare Agents.

You help engineers plan and validate cloud data migrations.

You specialize in:
- Oracle to Cloud migration
- Oracle Data Foundation Cloud Service style migration planning
- SQL validation
- schema mapping
- reconciliation checks
- data quality checks
- rollback planning
- production migration readiness

When the user describes a migration problem, you should:
1. Identify source system, target system, table/domain, data volume and risk.
2. Create a practical migration plan.
3. Suggest SQL validation and reconciliation checks.
4. Explain data quality risks.
5. Recommend a safe rollout strategy.
6. If the user asks to start or run a migration workflow, use the startMigrationWorkflow tool.

Important:
- Never claim that a real database was modified.
- This project simulates migration workflow execution for assignment/demo purposes.
- Be concise, technical and implementation-focused.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls and reasoning to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,
        //Cloud migration tool
        startMigrationWorkflow: tool({
          description:
            "Start a simulated cloud data migration workflow. Use this when the user asks to start, run, execute, validate, or simulate a database migration.",
          inputSchema: z.object({
            sourceSystem: z
              .string()
              .describe("Source database or system, for example Oracle"),
            targetSystem: z
              .string()
              .describe("Target database or system, for example PostgreSQL or Oracle Cloud"),
            tableName: z
              .string()
              .describe("Main table or business domain being migrated"),
            estimatedRows: z
              .number()
              .optional()
              .describe("Estimated number of rows being migrated"),
            migrationGoal: z
              .string()
              .optional()
              .describe("Business or technical goal of the migration")
          }),
          execute: async ({
            sourceSystem,
            targetSystem,
            tableName,
            estimatedRows,
            migrationGoal
          }) => {
            const rows = estimatedRows ?? 1000000;

            const workflow = {
              workflowName: "CloudMigrate AI Migration Workflow",
              sourceSystem,
              targetSystem,
              tableName,
              estimatedRows: rows,
              migrationGoal:
                migrationGoal ??
                `Migrate ${tableName} from ${sourceSystem} to ${targetSystem}`,
              status: "SUCCESS",
              steps: [
                {
                  step: 1,
                  name: "Requirement Analysis",
                  status: "completed",
                  output: `Identified migration from ${sourceSystem} to ${targetSystem} for ${tableName}.`
                },
                {
                  step: 2,
                  name: "Source Schema Validation",
                  status: "completed",
                  output: `Validated source metadata and nullable/key column assumptions for ${tableName}.`
                },
                {
                  step: 3,
                  name: "Column Mapping",
                  status: "completed",
                  output:
                    "Generated logical mapping for primary keys, business columns, timestamps and audit fields."
                },
                {
                  step: 4,
                  name: "Migration Simulation",
                  status: "completed",
                  output: `Simulated movement of ${rows.toLocaleString()} rows. No real database was modified.`
                },
                {
                  step: 5,
                  name: "Reconciliation",
                  status: "completed",
                  output:
                    "Compared source count, target count, checksum strategy and null distribution checks."
                },
                {
                  step: 6,
                  name: "Migration Report",
                  status: "completed",
                  output:
                    "Generated readiness summary with validation SQL, risks and rollback recommendation."
                }
              ],
              validationSql: [
                `SELECT COUNT(*) AS source_count FROM ${tableName};`,
                `SELECT COUNT(*) AS target_count FROM ${tableName};`,
                `SELECT COUNT(*) AS null_key_count FROM ${tableName} WHERE id IS NULL;`,
                `SELECT id, COUNT(*) FROM ${tableName} GROUP BY id HAVING COUNT(*) > 1;`
              ],
              risks: [
                "Primary key mismatch between source and target",
                "Data type conversion issues",
                "Timezone differences in timestamp columns",
                "Duplicate records",
                "Nulls in mandatory business fields",
                "Partial load or failed batch replay"
              ],
              recommendation:
                "Run migration in batches, validate after each batch, reconcile counts and checksums, then perform final cutover only after zero critical mismatches."
            };

            return workflow;
          }
        }),
        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(20),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
