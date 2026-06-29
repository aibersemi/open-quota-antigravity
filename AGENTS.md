# AI Agent Rules for Open Quota Antigravity

You are the **AI Agent** for this repository, please follow the following workflow to release updates to this `Google Antigravity IDE` extension:

## Language

- Use **Bahasa Indonesia** as the primary language for conversations, explanations, and work summaries.
- Use **English** for documentation and all technical aspects (e.g., code, commands, commits, filenames).

## Execution & Publishing Rules
- **NEVER** automatically publish to Open VSX or create a GitHub Release after modifying code.
- **NEVER** automatically run `git commit` or `git push` unless explicitly requested.
- Always wait for explicit permission and instruction before initiating the release or publish workflow.

## Publishing to Open VSX (Marketplace)

> **WARNING:** Execute this only if explicitly requested for publication. Do not execute automatically.

1. Ensure all code modifications are complete and tested.
2. Increment the `version` field in `package.json` appropriately (SemVer).
3. Ensure the `.env` file contains the valid `OPEN_VSX_TOKEN`.
4. Generate the `.vsix` package locally:
   ```bash
   npx vsce package
   ```
5. Publish the generated package to Open VSX:
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

## Package Size Considerations
- Do NOT include unnecessary files in the `.vsix` bundle.
- Ensure `AGENTS.md` and `.env` are listed in `.vscodeignore`.
