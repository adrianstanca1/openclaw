# Gateway Server Methods

This module implements the gateway's RPC/server method handlers for agent operations, chat, sessions, and system management.

## Key Files

| File                                  | Purpose                                                     |
| ------------------------------------- | ----------------------------------------------------------- |
| `agent.ts`                            | Agent lifecycle operations (create, update, delete, status) |
| `agents.ts` / `agents-mutate.test.ts` | Agent management and mutation tests                         |
| `chat.ts`                             | Chat message handling and streaming                         |
| `sessions.ts`                         | Session management (start, stop, query, logs)               |
| `send.ts` / `send.test.ts`            | Message sending logic and tests                             |
| `nodes.ts`                            | Node invocation and workflow execution                      |
| `skills.ts`                           | Skill discovery and management                              |
| `usage.ts`                            | Usage tracking and billing                                  |
| `config.ts`                           | Gateway configuration management                            |
| `health.ts`                           | Health check endpoints                                      |
| `browser.ts`                          | Browser automation methods                                  |

## Testing

```bash
# Run all server-methods tests
pnpm test:gateway

# Run specific test file
pnpm vitest run src/gateway/server-methods/chat.ts

# Run with coverage
pnpm test:coverage src/gateway/server-methods/
```

## Architecture Notes

- This is the **gateway RPC layer** - all client requests flow through here
- Methods are organized by domain: agents, chat, sessions, nodes, skills, usage
- Tests are colocated (`*.test.ts`) with source files
- See parent `CLAUDE.md` for project-wide build/test commands and conventions

## Critical Gotchas

- Pi session transcripts are a `parentId` chain/DAG; never append Pi `type: "message"` entries via raw JSONL writes (missing `parentId` can sever the leaf path and break compaction/history). Always write transcript messages via `SessionManager.appendMessage(...)` (or a wrapper that uses it).
