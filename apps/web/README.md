# @startup/web

Next.js App Router application for the startup template.

Run commands from the repository root with pnpm:

```bash
pnpm db:up      # start local PostgreSQL
pnpm db:migrate # apply database migrations
pnpm dev        # start the development server on http://localhost:3000
pnpm verify     # lint, typecheck, test, build
```

Environment variables are loaded from the repository root `.env.local`. See `.env.example` and `docs/architecture/`.
