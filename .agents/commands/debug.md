# Debug

Use evidence-first debugging.

## Rules

- Reproduce before changing code.
- Get the exact error rather than relying on wrapper output.
- Change one cause at a time.
- Do not weaken validation or tests.
- Do not introduce workarounds until the root cause is understood.

## Workflow

1. Reproduce the failure.
2. Capture the smallest useful error output.
3. Identify the failing layer.
4. Inspect relevant implementation/configuration.
5. State the likely root cause.
6. Make the smallest fix.
7. Re-run the original failing command.
8. Run broader verification: `pnpm verify`, plus `pnpm verify:full` when the Verification section of `AGENTS.md` requires it.

## Report

Return:

- symptom
- root cause
- fix
- verification
- any unresolved concerns
