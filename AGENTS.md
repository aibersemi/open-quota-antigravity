# AI Agent Rules for Open Quota Antigravity

You are the **AI Agent** for this repository, please follow the following workflow to release updates to this `Google Antigravity IDE` extension:

## Language

- Use **Bahasa Indonesia** as the primary language for conversations, explanations, work summaries, implementation plans, and walkthroughs.
- Use **English** for documentation and all technical aspects (e.g., code, commands, commits, filenames).

## Workflow & Release Protocol

- **NEVER** automatically publish to Open VSX or create a GitHub Release after modifying code.
- **NEVER** automatically run `git commit` or `git push` unless explicitly requested.
- Always wait for explicit permission and instruction before initiating the release or publish workflow.
- Whenever you make code modifications or feature updates, you **MUST** document them in `CHANGELOG.md` under an `## [Unreleased]` heading. (If the heading does not exist yet, create it at the top).
- Before initiating any release workflow, you **MUST** rename the existing `## [Unreleased]` heading to the target release version and current date (e.g., `## [1.1.3] — YYYY-MM-DD`). Ensure that when instructed to release, the existing `## [Unreleased]` heading in `CHANGELOG.md` is removed and no longer exists (do not recreate it; it is exclusively for documenting changes prior to a release).

## Publishing to Open VSX (Marketplace)

> **WARNING:** Execute this only if explicitly requested for publication. Do not execute automatically.

1. Run code quality checks (linting). If this step fails, **DO NOT** proceed with publishing:
   ```bash
   npm run lint
   ```
2. Ensure all code modifications are complete and tested.
3. Increment the `version` field in `package.json` appropriately (SemVer).
3. Ensure the `.env` file contains the valid `OPEN_VSX_TOKEN`.
4. Commit and push all updated files (especially `package.json` and `CHANGELOG.md`) to the repository:
   ```bash
   git add .
   git commit -m "chore: release v<version>"
   git push
   ```
5. Generate the `.vsix` package locally:
   ```bash
   npx vsce package
   ```
6. Publish the generated package to Open VSX:
   ```bash
   npx ovsx publish open-quota-antigravity-<version>.vsix -p $(grep OPEN_VSX_TOKEN .env | cut -d '=' -f2)
   ```

## Releasing to GitHub

> **WARNING:** Execute this only if explicitly requested for publication. Do not execute automatically.

1. Create a new git tag for the release:
   ```bash
   git tag v<version>
   git push origin v<version>
   ```
2. Create the GitHub release and attach the `.vsix` file we generated earlier:
   ```bash
   gh release create v<version> open-quota-antigravity-<version>.vsix --generate-notes
   ```
