# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the app code: `app/` for the shell (bootstrap, renderer, routes, layout), `pages/` for routed screens
(`pages/shared/` holds page templates like `CatalogGridPage`), `features/` for vertical slices (`auth/`, `player/` with
its backend-agnostic core), `components/` for reusable UI, `lib/` for API/storage/presentation helpers, `shared/` for
layout constants, logging and navigation utilities, `platform/` for Tizen/Capacitor integration, and `debug/` for the
on-TV overlay state. Platform build wiring lives in `devices/`, environment files in `environments/`, static assets in
`public/` (`assets/lang`, `fonts`), Storybook config in `.storybook/`, and helper scripts in `scripts/`. Build output
goes to `dist/` and should never be edited manually.

## Build, Test, and Development Commands

Use `pnpm`; the repo pins it in `package.json`.

- `pnpm start`: run the Vite dev server with host exposure and auto-open.
- `pnpm start:tizen`: start dev mode with `TARGET_DEVICE=tizen`.
- `pnpm build`: create a sourcemapped production bundle.
- `pnpm build:tizen`: build the Tizen-targeted app in `dist/tizen/`.
- `pnpm preview`: serve the built app on port `8080`.
- `pnpm lint`: run ESLint on JS/TS/Solid files.
- `pnpm format` / `pnpm format:check`: apply or verify Prettier formatting.
- `pnpm storybook`: run Storybook locally.

### TypeScript 6 / 7 side-by-side

TypeScript 7 dropped the programmatic API that `typescript-eslint` imports, so `package.json` carries two npm
aliases: `typescript` resolves to `@typescript/typescript6` (the API `typescript-eslint` loads, exposed on the CLI
as `tsc6`) and `@typescript/native` resolves to the real `typescript@7` (which owns the `tsc` binary). So `pnpm tsc`
type-checks with 7.x while `pnpm lint` keeps working against the 6.x API. Do not "simplify" `typescript` back to a
plain `^7` range — that silently kills ESLint. Collapse both aliases into one dependency once typescript-eslint
supports TS >= 7.1 (typescript-eslint#10940).

## Coding Style & Naming Conventions

Use TypeScript and SolidJS with 2-space indentation, double quotes, semicolons, and trailing commas in multiline
structures. Keep page and component files in PascalCase (`Home.tsx`, `FavoriteButton.tsx`). Use camelCase for utility
and config files (`api.ts`, `storage.ts`, `contentMeta.ts`). Import style: use the `@/` alias for anything outside the
current directory; plain relative imports (`./auth`, `../playerState`) only within the same feature/folder. `#devices`
maps to platform-specific code. `tsconfig.json` is `strict`; avoid adding new `any` usage even where ESLint currently
permits it.

## Testing Guidelines

Vitest is the test runner (`vitest.config.ts`, jsdom environment). Place tests beside the code they cover using
`*.test.{js,jsx,ts,tsx}`. There are currently no test suites — `passWithNoTests` keeps `pnpm test` green — so new
tests for storage helpers, `lib/contentMeta`, and player/device logic are welcome and should become the gate once they
exist.

## Commit & Pull Request Guidelines

Recent history uses emoji-prefixed conventional subjects such as `🎯 feat entry: ...`, `🔧 chore: ...`, and `📝 docs: ...`.
Keep commits small, imperative, and scoped to one concern. Before opening a PR, run `pnpm lint` and `pnpm format:check`;
note any test limitations explicitly. PRs should include a short summary, linked issue when applicable, impacted device
targets (`lg`, `tizen`, browser), and screenshots or video for visible UI changes.
