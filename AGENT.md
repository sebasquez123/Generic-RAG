# Codex Agent Lineups

Default project name: `rag-multiagent-api`.

Use these lineups when assigning Codex agents to keep work bounded and easy to review.

## Default Lineup

- Lead Agent: owns architecture decisions, integration order, and final review.
- Domain Agent: owns `src/domain/**`, port design, RAG entities, and invariants.
- Application Agent: owns `src/application/**`, orchestration use cases, graph-facing flow, and tests.
- Infrastructure Agent: owns `src/infrastructure/**`, provider SDK adapters, pgvector repositories, and LangGraph runtime integration.
- Interface Agent: owns `src/interfaces/**`, controllers, DTOs, request validation, and API ergonomics.
- Verification Agent: owns build, unit tests, contract tests, and failure-mode checks.
- Documentation Agent: owns README, culture notes, runbooks, and agent instructions.

## Implementation Rules

- Agents must not rewrite another agent's owned files unless explicitly coordinating an integration change.
- When adding Gemini, GPT, Claude, or DeepSeek support, implement one adapter per provider behind `ModelProviderPort`.
- When adding pgvector, keep SQL/vector details behind `VectorStorePort`.
- When adding LangGraph, keep graph state and transitions behind `RetrievalGraphPort`.
- Prefer contract tests for ports before introducing real provider calls.
- Keep the API exclusively focused on RAG. Do not add unrelated CRUD modules.

## Review Checklist

- Does dependency direction still point inward?
- Are providers replaceable without changing the use case?
- Are model outputs traceable back to retrieved context?
- Are low-confidence, empty-context, timeout, and partial-provider-failure paths handled?
- Are docs updated when architecture or agent ownership changes?

