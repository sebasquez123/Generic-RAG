# Engineering Culture

This project is a RAG-first NestJS API. Every change should improve grounded inference, model orchestration, retrieval quality, observability, or operational safety.

## SOLID Principles

- Single Responsibility: keep controllers thin, use cases focused, and adapters limited to one external concern.
- Open/Closed: add new model providers, vector stores, or graph workflows through ports and modules instead of rewriting orchestration logic.
- Liskov Substitution: every adapter must honor the behavior promised by its domain port, including errors, empty results, and timeout handling.
- Interface Segregation: ports should expose only what a use case needs. Avoid provider-specific methods in shared contracts.
- Dependency Inversion: application services depend on domain abstractions, never SDK clients, HTTP clients, or database implementations.

## Best Practices

- Keep business rules in `domain` and `application`.
- Keep provider SDKs, pgvector clients, and LangGraph runtime code in `infrastructure`.
- Treat retrieved context as evidence, not decoration. Answers should be grounded in returned context and cite sources once citation support is added.
- Make model disagreement explicit. Do not silently hide conflicting inferences.
- Prefer small, replaceable adapters over broad service classes.
- Validate inputs at the interface boundary.
- Add tests around orchestration decisions, adapter contracts, and failure modes.
- Log graph state transitions, retrieval counts, provider latency, and synthesis decisions when observability is introduced.
- Never place secrets in code, tests, examples, or documentation.

## Agent Introspection

Before changing code, an agent should ask:

- What RAG capability does this change improve?
- Which layer owns this behavior?
- Is the change provider-neutral, or should it live in an adapter?
- What assumptions did retrieval, model inference, or graph synthesis make?
- How will we test empty context, low-confidence answers, provider failure, and conflicting model outputs?

After changing code, an agent should report:

- Files changed.
- Architecture layer touched.
- Tests run.
- Any remaining stubbed behavior.
- Risks to retrieval quality, grounding, latency, or provider costs.

