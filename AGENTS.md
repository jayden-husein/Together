## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on jayden-husein/Together (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Database (Supabase)

Merging to `main` deploys `supabase/migrations/` to the production database via the Supabase GitHub integration. So every schema change ships as a migration:

- Create it with `npx supabase migration new <name>`, then write the SQL in the generated file.
- Applied migrations are history: fix mistakes with a new migration, leaving merged ones untouched.
- Inspect the live schema and data through the `supabase` MCP server (read-only) before writing a migration.
