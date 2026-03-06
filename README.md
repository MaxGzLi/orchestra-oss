# Orchestra

Standalone open-source demo for an agent orchestration board.

## What It Includes

- Feature intake instead of issue-first planning
- Task graph grouped by delivery flow
- Commander handoff packets for Codex and Claude Code
- Local simulated execution and task timeline
- Chinese / English UI toggle

## What It Does Not Include

- Auth
- Backend persistence
- Real Codex or Claude Code CLI execution

This repo is intentionally clean and self-contained so it can be published publicly without internal dependencies.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
