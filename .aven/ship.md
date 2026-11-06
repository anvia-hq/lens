Ship this thread's work as a pull request against `main`, the way this team does. Read `AGENTS.md` first if you have not; its rules apply.

## 1. Branch

Work on a branch named for the kind of change: `fix/<topic>`, `feat/<topic>`, `chore/<topic>`, `docs/<topic>` or `test/<topic>`, with a short kebab-case topic (for example `fix/lens-span-timestamp-bounds`). If this thread already has an open pull request, keep using its branch.

## 2. Commit

- Commit only what belongs to the work. Messages are short and descriptive; Conventional Commit prefixes (`fix:`, `feat(api):`, `docs:`, `test:`, `chore(deps):`) are welcome.
- Never commit `.env` files, `dist/`, `coverage/`, secrets, production data or private trace payloads.
- Do not bump the root `package.json` version, edit applied migrations, or hand-edit `pnpm-lock.yaml`.
- `.aven/` setup files are fine to commit when they changed.

## 3. Update from main

`git fetch origin main && git merge origin/main` (the team merges main into branches; do not rebase a branch that is already pushed). Resolve conflicts; if one is unclear, stop and tell me.

## 4. Run the checks

Run what CI runs, except `pnpm test:coverage`, which needs Docker and is left to CI:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm typecheck
pnpm build
pnpm check:bundle
pnpm --filter @lens/example-anvia-agent test
pnpm test
pnpm audit:prod
```

- If a check fails because of this work, fix it and run it again.
- If `pnpm check` fails only on files this work did not touch, or `pnpm audit:prod` fails on an advisory unrelated to this work, or the npm advisory endpoint is down, do not fix it here: note it in the pull request.
- If anything else fails and you cannot fix it, stop and tell me. Never ship with failing tests you caused.
- Keep the command and its result (pass, or the number of tests passed) for the description.

## 5. Proof for visible web UI changes

Only when the work changes what users see in `apps/web` or `packages/ui`:

1. Start the services and app in the background: `.aven/resume` (if not already running), then `export LENS_SEED_DEMO_PASSWORD=local-proof-password-1 && pnpm db:migrate && pnpm db:seed` (the seed no longer ships a fixed password; it uses this variable, and the same variable is read when recording), then `pnpm dev` as a background process. Wait for http://localhost:3000.
2. Write a short flow at `/tmp/proof-flow.mjs` that shows the change, for example:
   ```js
   export default async ({ page, shot, login }) => {
     await login(); // seeded demo user
     await page.goto("/"); // then navigate to the changed screen
     await shot("after");
   };
   ```
   Keep it under ~20 seconds of interaction.
3. Run `node .aven/record-proof.mjs /tmp/proof-flow.mjs`. It writes `flow.webm` and the screenshots into `.aven/proof/`. If the change alters an existing screen, also record a `before` screenshot from `origin/main` when practical.
4. Look at the screenshots yourself before committing them. Commit `.aven/proof/` to the branch in a commit named `docs: add UI proof (remove before merge)`.
5. Stop the dev server when done.

If recording fails and you cannot fix it quickly, ship anyway and write "No visual verification was run" with the reason. For changes with no visible UI, write "No visible UI changes."

## 6. Push

`git push -u origin HEAD`. Never push to `main`, never force-push `main`.

## 7. Open the pull request

If a pull request is already open for this branch, the push updates it: edit its description with `gh pr edit` when the change or validation changed. Otherwise:

```sh
gh pr create --base main --title "<title>" --body-file /tmp/pr-body.md
```

Open it ready for review (not a draft). No reviewers or labels. Title: plain sentence or Conventional Commit style, under ~70 characters.

Body, in this order:

- **What changed and why**: one or two short paragraphs. Lead with the problem, then what the change does.
- **Validation**: a bullet list of every command run and its result, including targeted package tests. Say that `pnpm test:coverage` (integration and coverage) was not run locally and is left to CI. Note anything skipped or failing and why.
- **Migrations, configuration and generated files**: list any PostgreSQL or ClickHouse migrations, config or env changes, and generated files changed on purpose; or "None".
- **Compatibility**: if the change touches schema, queue jobs or persisted data, say that the release upgrade and recovery rehearsal in `docs/release-verification.md` should be run before release, and that it was not run here.
- **UI**: link the proof files from the branch, for example `https://github.com/anvia-hq/lens/blob/<branch>/.aven/proof/after.png` and `.../flow.webm`, and note that `.aven/proof/` must be removed before merging. Or "No visible UI changes."

## 8. Do not merge

Do not merge, do not turn on auto-merge, do not run releases, tag, publish images or deploy. Tell me the pull request's URL, the checks you ran, and anything I need to decide.
