# Agent instructions

## Local development ports

- The development server for **hackbuddy** uses **http://localhost:3010**.
- Run `npm run dev` in the normal checkout; its development script sets port **3010** explicitly. Do not use localhost:3000 or silently increment ports.
- Reuse an existing server for this checkout. If the assigned port is occupied by an unrelated process, inspect ownership rather than stopping another project's server.
- Port changes must update the development script, README, environment examples, and local integration/callback URLs together. Keep real credentials in ignored local environment files; never commit them or change production URLs for local development.

On Haseab's BB machine, the shared registry is `~/.bb/dev-ports.json` and
`~/.bb/bin/project-dev hackbuddy` uses the same assignment. These personal
files are optional; collaborators can use the repository commands above.

## Judging experience

- One application: use the original `AppShell`, routes, judging queue, project details, scoring card and TV presentations. Do not add a separate studio or competing design system.
- Preserve First pass judging → Top N → Second pass judging → Winners. No first-pass TV button. Configure counts and scoring through the original Hackathons event editor.
- New events use server-side Supabase persistence and `/<event>/submit`; historical Airtable events remain readable through their original adapter. Never migrate or delete historical records implicitly.
- Keep changes narrow. Reuse original screens and global design tokens; extra project details and optional sponsor/award collections stay collapsed until needed.
- Database writes must preserve concurrent judges, draft recovery, event isolation, and publication locks. Never expose the Supabase database password to the browser.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
