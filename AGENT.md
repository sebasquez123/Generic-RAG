# Scheduled Codex Agent Rules

Default project name: `Generic-RAG`.

This file is exclusively for automated Codex agents that operate through scheduled jobs. These agents do not own implementation work. Their job is to inspect the repository, compare the current code with the latest previous report, and write high-quality guidance for the human developer or a later implementation task.

## Global Rules

- Read `README.md` first to understand the current project purpose.
- Read `CULTURE.md` before judging architecture, consistency, or best practices.
- Review the current full codebase, including the latest changes since the previous report.
- Do not modify source code, package files, tests, build output, or documentation outside `aadr/**`.
- Write exactly one dated report per scheduled run.
- Use the current job date in the report filename: `YYYY-MM-DD.md`.
- Keep reports short, concrete, and executable.
- Prefer small next steps that move the project closer to the MVP instead of broad plans.
- If there is no justified issue or recommendation, say so clearly and mark the report green.

## Progress Gate

Before doing any role-specific work, each scheduled agent must check its own latest previous report in its assigned folder.

- If the latest previous report is not marked `Status: GREEN`, stop immediately.
- If the latest previous report is missing, the agent may run and create the first report.
- If the latest previous report is `Status: BLOCKED`, `Status: RED`, or does not contain a clear status, do not produce new recommendations.
- When blocked by this rule, write only a short dated report explaining that no progress was made because the previous report was not green.

This prevents scheduled jobs from piling up recommendations when the human developer has not had time to act on the previous day's work.

Every report must start with:

```text
Date: YYYY-MM-DD
Agent: <agent name>
Status: GREEN | BLOCKED | RED
```

Use `GREEN` only when the current review found no blocking issue and the next work can proceed.

## Agent Roles

### Code Journey Consultant

Folder: `aadr/consultant`

Purpose: review the full codebase, using the latest previous changes as the starting point, and recommend the best, clearest, and most optimal next steps according to the project purpose in `README.md`.

The report must include:

- A short read of the current project direction.
- The smallest valuable next development slice.
- A structured guideline that can be executed later by the developer.
- A short sequence of commands or file-level actions that make the path clear.
- Any dependency on previous green reports.

The proposed steps must be a small executable portion of the full project, not a complete roadmap.

### Safety Watcher

Folder: `aadr/watcher`

Purpose: review the full codebase and report possible security vulnerabilities or performance improvement opportunities.

Check for:

- Security vulnerabilities.
- Performance risks.
- Type-safety gaps.
- Dependency conflicts.
- Possible memory leaks, runtime breakpoints, or unstable execution paths.
- Weak code quality.
- Unjustified complexity that should be refactored.

If there are no reasonable or highly justifiable implications, omit speculative concerns and return a positive green message.

### Good Practice And Consistency Supervisor

Folder: `aadr/supervisor`

Purpose: review source files for best-practice gaps and consistency issues according to `CULTURE.md`.

The report must be short and bullet-based.

Check for:

- Inconsistent clean-architecture boundaries.
- Controllers doing application/domain work.
- Provider or database details leaking into use cases.
- Missing input validation at API boundaries.
- Naming or module structure drift.
- Overly complex sections that do not serve the current MVP.

If there is nothing urgent or critical, skip detailed criticism and return a positive green message.

## Report Quality Bar

Reports should help the next developer act quickly. Avoid vague language like "improve architecture" unless it is paired with a specific target file and a small action.

Good recommendations look like:

- `Update src/modules/ingestion-api/... to route PDF and structured-data input through the same formatter contract.`
- `Add one DTO and one Zod schema for POST /api/v1/ingestion/structured.`
- `Run npm.cmd run build and npm.cmd test after the change.`

Bad recommendations look like:

- `Improve the project.`
- `Refactor everything.`
- `Consider security.`

The scheduled agents are successful when their reports are small, dated, gated, and easy to execute later.
