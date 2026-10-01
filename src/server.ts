import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest } from "agents";
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

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/google/gemma-4-26b-a4b-it", {
        sessionAffinity: this.sessionAffinity
      }),

      system: `You are CloudMigrate AI, a database migration and database architecture copilot built on Cloudflare Agents.

You ONLY answer queries related to databases, data migration, data validation, schema design, data modeling, relational databases, non-relational databases, SQL, NoSQL, indexing, replication, consistency, reconciliation, rollback planning, database performance, and production readiness.

You support both relational and non-relational databases, including:
- Oracle
- PostgreSQL
- MySQL
- SQL Server
- SQLite
- MongoDB
- Cassandra
- DynamoDB
- Redis
- Elasticsearch / OpenSearch
- Neo4j
- Cloud database migration scenarios

Your core responsibilities:
1. Help users plan database migrations.
2. Compare relational vs non-relational database choices.
3. Generate schema mapping strategies.
4. Generate validation and reconciliation SQL or query checks.
5. Identify production migration risks.
6. Recommend indexing, partitioning, batching, rollback and cutover strategies.
7. Simulate migration workflow execution when requested.

Important behavior:
- If the user asks something unrelated to databases, politely say you are focused on database and migration topics only.
- Never claim that a real database was modified.
- All workflow execution is simulated for demo/assignment purposes.
- Be concise, practical and engineering-focused.
- Prefer structured answers with steps, checks, risks and recommendations.`,

      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),

      tools: {
        startMigrationWorkflow: tool({
          description:
            "Start a simulated database migration workflow for relational or non-relational databases.",
          inputSchema: z.object({
            sourceSystem: z
              .string()
              .describe("Source database, for example Oracle, MySQL, MongoDB"),
            targetSystem: z
              .string()
              .describe(
                "Target database, for example PostgreSQL, MongoDB, DynamoDB"
              ),
            dataModel: z
              .enum([
                "relational",
                "document",
                "key-value",
                "wide-column",
                "graph",
                "search",
                "unknown"
              ])
              .optional()
              .describe("Database model type"),
            tableOrCollection: z
              .string()
              .describe(
                "Main table, collection, index, graph label, or business domain"
              ),
            estimatedRowsOrDocuments: z
              .number()
              .optional()
              .describe("Estimated rows/documents/items being migrated"),
            migrationGoal: z
              .string()
              .optional()
              .describe("Business or technical goal of migration")
          }),

          execute: async ({
            sourceSystem,
            targetSystem,
            dataModel,
            tableOrCollection,
            estimatedRowsOrDocuments,
            migrationGoal
          }) => {
            const volume = estimatedRowsOrDocuments ?? 1000000;
            const model = dataModel ?? "unknown";

            return {
              workflowName: "CloudMigrate AI Database Migration Workflow",
              sourceSystem,
              targetSystem,
              dataModel: model,
              tableOrCollection,
              estimatedRowsOrDocuments: volume,
              migrationGoal:
                migrationGoal ??
                `Migrate ${tableOrCollection} from ${sourceSystem} to ${targetSystem}`,
              executionType: "SIMULATED",
              status: "SUCCESS",
              steps: [
                {
                  step: 1,
                  name: "Requirement Analysis",
                  status: "completed",
                  output: `Identified migration from ${sourceSystem} to ${targetSystem} for ${tableOrCollection}.`
                },
                {
                  step: 2,
                  name: "Source Profiling",
                  status: "completed",
                  output:
                    "Profiled estimated data volume, key fields, null patterns, duplicate risks and schema shape."
                },
                {
                  step: 3,
                  name: "Target Model Mapping",
                  status: "completed",
                  output:
                    model === "relational"
                      ? "Prepared relational mapping for primary keys, foreign keys, constraints, indexes and audit columns."
                      : "Prepared non-relational mapping for document shape, partition key, sort key, embedding strategy or access pattern."
                },
                {
                  step: 4,
                  name: "Batch Migration Simulation",
                  status: "completed",
                  output: `Simulated migration of ${volume.toLocaleString()} records/items in safe batches. No real database was modified.`
                },
                {
                  step: 5,
                  name: "Validation And Reconciliation",
                  status: "completed",
                  output:
                    "Generated checks for count reconciliation, key uniqueness, checksum/hash comparison and null distribution."
                },
                {
                  step: 6,
                  name: "Cutover Readiness",
                  status: "completed",
                  output:
                    "Prepared final readiness summary with rollback strategy, monitoring points and go/no-go criteria."
                }
              ],
              recommendation:
                "Use batch-based migration, validate after each batch, compare source and target counts/checksums, freeze writes during final cutover and keep rollback scripts ready."
            };
          }
        }),

        generateValidationQueries: tool({
          description:
            "Generate validation queries for relational or non-relational database migration reconciliation.",
          inputSchema: z.object({
            databaseType: z
              .enum([
                "relational",
                "mongodb",
                "dynamodb",
                "cassandra",
                "redis",
                "elasticsearch",
                "unknown"
              ])
              .describe("Type of database/query style"),
            objectName: z
              .string()
              .describe(
                "Table, collection, index, keyspace table, or object name"
              ),
            keyField: z
              .string()
              .optional()
              .describe(
                "Primary key, document id, partition key, or unique business key"
              )
          }),

          execute: async ({ databaseType, objectName, keyField }) => {
            const key = keyField ?? "id";

            if (databaseType === "mongodb") {
              return {
                databaseType,
                objectName,
                validationQueries: [
                  `db.${objectName}.countDocuments({})`,
                  `db.${objectName}.aggregate([{ $group: { _id: "$${key}", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }])`,
                  `db.${objectName}.countDocuments({ ${key}: { $exists: false } })`,
                  `db.${objectName}.find({ ${key}: null }).limit(10)`
                ]
              };
            }

            if (databaseType === "dynamodb") {
              return {
                databaseType,
                objectName,
                validationChecks: [
                  "Compare source record count with DynamoDB item count using scan/count or exported table metrics.",
                  `Validate partition key presence: ${key}`,
                  "Sample migrated items and compare source vs target field-level hashes.",
                  "Check throttling, failed writes and retry logs."
                ]
              };
            }

            if (databaseType === "elasticsearch") {
              return {
                databaseType,
                objectName,
                validationQueries: [
                  `GET ${objectName}/_count`,
                  `GET ${objectName}/_search`,
                  "Validate document id uniqueness and mapping compatibility.",
                  "Compare indexed document count with source count."
                ]
              };
            }

            return {
              databaseType: "relational",
              objectName,
              validationQueries: [
                `SELECT COUNT(*) AS total_count FROM ${objectName};`,
                `SELECT COUNT(*) AS null_key_count FROM ${objectName} WHERE ${key} IS NULL;`,
                `SELECT ${key}, COUNT(*) AS duplicate_count FROM ${objectName} GROUP BY ${key} HAVING COUNT(*) > 1;`,
                `SELECT MIN(${key}) AS min_key, MAX(${key}) AS max_key FROM ${objectName};`,
                `SELECT COUNT(*) AS recently_loaded_count FROM ${objectName} WHERE ${key} IS NOT NULL;`
              ]
            };
          }
        }),
        generateMigrationScript: tool({
          description:
            "Generate migration query/script examples for SQL to NoSQL or NoSQL to SQL database migration.",
          inputSchema: z.object({
            migrationDirection: z
              .enum([
                "sql-to-nosql",
                "nosql-to-sql",
                "sql-to-sql",
                "nosql-to-nosql"
              ])
              .describe("Direction of migration"),
            sourceSystem: z
              .string()
              .describe(
                "Source database, for example Oracle, PostgreSQL, MongoDB"
              ),
            targetSystem: z
              .string()
              .describe(
                "Target database, for example MongoDB, PostgreSQL, DynamoDB"
              ),
            sourceObject: z
              .string()
              .describe("Source table, collection, index, or object name"),
            targetObject: z
              .string()
              .describe("Target table, collection, index, or object name"),
            keyField: z
              .string()
              .optional()
              .describe(
                "Primary key, document id, partition key, or unique business key"
              ),
            sampleFields: z
              .array(z.string())
              .optional()
              .describe(
                "Important fields to migrate, for example customer_id, name, email"
              )
          }),

          execute: async ({
            migrationDirection,
            sourceSystem,
            targetSystem,
            sourceObject,
            targetObject,
            keyField,
            sampleFields
          }) => {
            const key = keyField ?? "id";
            const fields = sampleFields?.length
              ? sampleFields
              : [key, "name", "email", "created_at", "updated_at"];

            if (migrationDirection === "sql-to-nosql") {
              return {
                migrationDirection,
                sourceSystem,
                targetSystem,
                sourceObject,
                targetObject,
                strategy:
                  "Read rows from relational source table, transform each row into a document/item, then insert into target NoSQL collection/table.",
                extractionSql: `SELECT ${fields.join(", ")} FROM ${sourceObject};`,
                mongoInsertExample: `db.${targetObject}.insertMany([
  {
    _id: "<${key}>",
${fields
  .filter((field) => field !== key)
  .map((field) => `    ${field}: "<${field}>",`)
  .join("\n")}
    migrated_at: new Date()
  }
]);`,
                dynamoDbItemShape: {
                  TableName: targetObject,
                  Item: fields.reduce<Record<string, string>>((acc, field) => {
                    acc[field] = `<${field}>`;
                    return acc;
                  }, {})
                },
                notes: [
                  "Choose partition key based on access pattern, not only source primary key.",
                  "Denormalize relational joins into embedded documents when read patterns require it.",
                  "Avoid one-to-one table-to-collection mapping unless access patterns justify it.",
                  "Validate source row count against target document/item count."
                ]
              };
            }

            if (migrationDirection === "nosql-to-sql") {
              return {
                migrationDirection,
                sourceSystem,
                targetSystem,
                sourceObject,
                targetObject,
                strategy:
                  "Read documents/items from NoSQL source, flatten nested fields, normalize repeated structures, then insert into relational target tables.",
                mongoReadExample: `db.${sourceObject}.find({}, {
${fields.map((field) => `  ${field}: 1,`).join("\n")}
});`,
                relationalTableExample: `CREATE TABLE ${targetObject} (
  ${key} VARCHAR(100) PRIMARY KEY,
${fields
  .filter((field) => field !== key)
  .map((field) => `  ${field} VARCHAR(255),`)
  .join("\n")}
  migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
                insertSqlExample: `INSERT INTO ${targetObject} (${fields.join(", ")})
VALUES (${fields.map((field) => `:${field}`).join(", ")});`,
                notes: [
                  "Nested JSON fields must be flattened or moved into child tables.",
                  "Arrays should usually become child tables with foreign keys.",
                  "Decide how to handle missing fields because NoSQL documents may not share the same schema.",
                  "Validate document count, null key count, duplicate key count and rejected records."
                ]
              };
            }

            if (migrationDirection === "sql-to-sql") {
              return {
                migrationDirection,
                sourceSystem,
                targetSystem,
                sourceObject,
                targetObject,
                strategy:
                  "Extract relational rows, transform data types if needed, then load into relational target table.",
                extractionSql: `SELECT ${fields.join(", ")} FROM ${sourceObject};`,
                targetInsertSql: `INSERT INTO ${targetObject} (${fields.join(", ")})
SELECT ${fields.join(", ")}
FROM staging_${targetObject};`,
                validationSql: [
                  `SELECT COUNT(*) FROM ${sourceObject};`,
                  `SELECT COUNT(*) FROM ${targetObject};`,
                  `SELECT ${key}, COUNT(*) FROM ${targetObject} GROUP BY ${key} HAVING COUNT(*) > 1;`
                ],
                notes: [
                  "Map source and target data types carefully.",
                  "Disable/rebuild indexes depending on volume.",
                  "Use staging tables for safer validation."
                ]
              };
            }

            return {
              migrationDirection,
              sourceSystem,
              targetSystem,
              sourceObject,
              targetObject,
              strategy:
                "Read from source NoSQL system, transform document/item shape, then write to target NoSQL model based on access pattern.",
              genericNoSqlPlan: [
                "Export source documents/items.",
                "Transform keys and document structure.",
                "Choose target partition key and sort key if applicable.",
                "Bulk write to target.",
                "Validate item count, key uniqueness and sample field-level hashes."
              ],
              notes: [
                "NoSQL-to-NoSQL migration depends heavily on access patterns.",
                "Do not blindly copy document shape if the target database has different partitioning/query behavior."
              ]
            };
          }
        }),
        analyzeDatabaseRisks: tool({
          description:
            "Analyze database migration risks for relational and non-relational systems.",
          inputSchema: z.object({
            sourceSystem: z.string(),
            targetSystem: z.string(),
            workloadType: z
              .enum([
                "oltp",
                "olap",
                "event-driven",
                "search",
                "cache",
                "analytics",
                "mixed",
                "unknown"
              ])
              .optional(),
            dataVolume: z.string().optional(),
            consistencyRequirement: z
              .enum(["strong", "eventual", "read-after-write", "unknown"])
              .optional()
          }),

          execute: async ({
            sourceSystem,
            targetSystem,
            workloadType,
            dataVolume,
            consistencyRequirement
          }) => {
            return {
              sourceSystem,
              targetSystem,
              workloadType: workloadType ?? "unknown",
              dataVolume: dataVolume ?? "not specified",
              consistencyRequirement: consistencyRequirement ?? "unknown",
              risks: [
                "Schema mismatch or incompatible data types",
                "Primary key or unique key collision",
                "Null values in mandatory target fields",
                "Timestamp and timezone conversion issues",
                "Large batch failures and partial replay problems",
                "Index creation slowing down bulk loads",
                "Source and target count mismatch",
                "Different consistency behavior between source and target",
                "Query pattern mismatch after moving from relational to NoSQL or vice versa"
              ],
              mitigations: [
                "Run profiling before migration",
                "Create schema mapping document",
                "Use idempotent batch loads",
                "Validate every batch with count and checksum checks",
                "Create target indexes after bulk load when possible",
                "Maintain rollback plan and source backup",
                "Run performance tests using production-like query patterns"
              ]
            };
          }
        }),

        recommendDatabaseModel: tool({
          description:
            "Recommend relational or non-relational database model based on access pattern and workload.",
          inputSchema: z.object({
            useCase: z.string().describe("Application or business use case"),
            accessPattern: z
              .string()
              .describe("How data will be queried, filtered or updated"),
            scaleRequirement: z
              .string()
              .optional()
              .describe("Expected scale, volume or traffic"),
            consistencyNeed: z
              .enum([
                "strong",
                "eventual",
                "read-heavy",
                "write-heavy",
                "unknown"
              ])
              .optional()
          }),

          execute: async ({
            useCase,
            accessPattern,
            scaleRequirement,
            consistencyNeed
          }) => {
            const access = accessPattern.toLowerCase();

            let recommendation = "relational";
            let suggestedDatabases = ["PostgreSQL", "MySQL", "Oracle"];

            if (
              access.includes("document") ||
              access.includes("json") ||
              access.includes("flexible schema")
            ) {
              recommendation = "document";
              suggestedDatabases = ["MongoDB", "Firestore"];
            } else if (
              access.includes("key value") ||
              access.includes("session") ||
              access.includes("cache")
            ) {
              recommendation = "key-value";
              suggestedDatabases = ["Redis", "DynamoDB"];
            } else if (
              access.includes("search") ||
              access.includes("full text") ||
              access.includes("logs")
            ) {
              recommendation = "search";
              suggestedDatabases = ["Elasticsearch", "OpenSearch"];
            } else if (
              access.includes("graph") ||
              access.includes("relationship network")
            ) {
              recommendation = "graph";
              suggestedDatabases = ["Neo4j"];
            } else if (
              access.includes("time series") ||
              access.includes("high write") ||
              access.includes("wide column")
            ) {
              recommendation = "wide-column/time-series";
              suggestedDatabases = ["Cassandra", "ScyllaDB", "TimescaleDB"];
            }

            return {
              useCase,
              accessPattern,
              scaleRequirement: scaleRequirement ?? "not specified",
              consistencyNeed: consistencyNeed ?? "unknown",
              recommendedModel: recommendation,
              suggestedDatabases,
              reasoning:
                "Recommendation is based on access pattern, consistency requirement, schema flexibility and scaling needs.",
              caution:
                "Final database choice should be validated with real query patterns, data volume, latency targets and operational constraints."
            };
          }
        })
      },

      stopWhen: stepCountIs(12),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
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
