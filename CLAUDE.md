## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repository’s GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

## Local development

Start the app with `pnpm dev:local`. It checks `.env.local`, installs dependencies, applies migrations, and runs the dev server. Do not run `pnpm dev` directly unless you have already applied migrations. See the README section on migrations and local startup.
