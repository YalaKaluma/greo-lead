# Codex Guidelines for Alfred

## Local frontend validation

Do not run local frontend build, package-manager validation, or frontend test commands unless the user explicitly asks for them.

In this workspace, the following commands may hang or fail because of local environment limitations:

- `pnpm i18n:check`
- `pnpm build`
- `pnpm test`
- `vite build`

When implementing frontend changes, Codex should:

- make the requested code changes;
- do a lightweight file/code review;
- report that local validation was intentionally skipped;
- suggest validation in CI, Railway, GitHub Actions, or the known working build environment.

If a validation command appears stuck, stop immediately and summarize the implementation status instead of launching more validation commands.
