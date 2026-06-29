# AI Agent Rules for Open Quota Antigravity

Welcome, AI Agent! If you are working on this repository, please adhere to the following workflow for releasing updates to this VS Code extension:

## Publishing to Open VSX (Marketplace)
1. Ensure all code modifications are complete and tested.
2. Increment the `version` field in `package.json` appropriately (SemVer).
3. Ensure the `.env` file contains the valid `OPEN_VSX_TOKEN`.
4. Run the publish command:
   ```bash
   npx ovsx publish -p $(grep OPEN_VSX_TOKEN .env | cut -d '=' -f2)
   ```
   *(Or extract the token and use `npx ovsx publish -p <TOKEN>` directly).*

## Releasing to GitHub
1. After successfully publishing to Open VSX, create a new git tag for the release:
   ```bash
   git tag v<version>
   git push origin v<version>
   ```
2. Create the GitHub release and attach the `.vsix` file (if generated, or omit it if you just want release notes):
   ```bash
   gh release create v<version> open-quota-antigravity-<version>.vsix --generate-notes
   ```

## Package Size Considerations
- Do NOT include unnecessary files in the `.vsix` bundle.
- Ensure `AGENTS.md` and `.env` are listed in `.vscodeignore`.
