# Orchestra OSS

Open-source demo for an agent orchestration board.

Orchestra turns a raw feature idea into a task graph that can route work across planning, execution, and oversight agents.

This repository is a standalone public demo. It does not depend on auth, databases, or private infrastructure.

## Demo Highlights

- Feature intake instead of issue-first planning
- Task graph grouped by delivery flow
- Commander handoff packets for Codex and Claude Code
- Local simulated execution and task timeline
- Chinese / English UI toggle
- Clean standalone Next.js app for public sharing

## Why This Repo Exists

The internal prototype was built inside a larger AI operations platform. This repo extracts the Orchestra concept into a smaller public-facing demo so the core interaction model can be shared, discussed, and extended independently.

## Tech Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- TypeScript
- shadcn-style UI primitives

## Getting Started

```bash
npm install
npm run dev
```

Then open:

```bash
http://localhost:3000
```

## How To Use It

If you open the app and still do not know where to start, read this first:

- [Orchestra 从 0 到 1 使用指南](./docs/zero-to-one-guide.md)

That guide covers:

- what the product is for
- what each major area on the screen does
- the shortest first-run path
- how to go from feature brief to batch execution
- how dispatch queue and multi-board workflow work
- what is real today vs what is still stubbed

Recommended order:

1. Read the guide once
2. Open the app
3. Follow the `7-step quick path`
4. Then come back and explore multi-board / dispatch / bridge settings

## What Is Simulated

This open-source version intentionally uses local simulation for execution.

- Handoff packets are real UI artifacts
- Run history is local demo state
- Timeline events are generated locally
- No external CLI is invoked yet
- Process runner contracts are defined, but still stubbed

This keeps the repo safe and easy to run without extra credentials.

## Project Structure

```text
src/
  app/                    Next.js app entry
  components/orchestra/   main Orchestra board UI
  components/ui/          shared UI primitives
  lib/orchestra/          task model, planner, handoff logic
  lib/utils.ts            styling helper
```

## Possible Extensions

- Add real Codex / Claude Code execution adapters
- Persist boards and runs to a backend
- Add multiplayer collaboration and realtime sync
- Add issue tracker adapters
- Add portfolio-level roadmap views

## License

MIT
