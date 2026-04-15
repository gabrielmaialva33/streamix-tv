# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the app code: `pages/` for routed screens, `components/` for reusable UI, `managers/` for runtime
controllers such as `PlayerManager.ts`, `lib/` for API/storage helpers, and `device/` for in-app device config. Platform
build wiring lives in `devices/`, environment files in `environments/`, static assets in `public/` (`assets/lang`,
`fonts`), Storybook config in `.storybook/`, and helper scripts in `scripts/`. Build output goes to `dist/` and should
never be edited manually.

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

## Coding Style & Naming Conventions

Use TypeScript and SolidJS with 2-space indentation, double quotes, semicolons, and trailing commas in multiline
structures. Keep page, component, and manager files in PascalCase (`Home.tsx`, `FavoriteButton.tsx`,
`PlayerManager.ts`). Use camelCase for utility and config files (`api.ts`, `storage.ts`, `config.ts`). Prefer the
configured aliases: `@/` for `src` and `#devices` for platform-specific code. `tsconfig.json` is `strict`; avoid adding
new `any` usage even where ESLint currently permits it.

## Testing Guidelines

Vitest is the test runner, with browser-mode settings currently defined in `vite.config.js`. Place tests beside the code
they cover using `*.test.{js,jsx,ts,tsx}`; the existing example is `src/components/Button/Button.test.jsx`. Add focused
tests for UI behavior, storage helpers, and player/device logic. Current repo note: `pnpm test` is broken on Vitest 4
until `browser.provider` is migrated from a string to the required factory import, so fix that before treating the suite
as a gate.

## Commit & Pull Request Guidelines

Recent history uses emoji-prefixed conventional subjects such as `🎯 feat entry: ...`, `🔧 chore: ...`, and `📝 docs: ...`.
Keep commits small, imperative, and scoped to one concern. Before opening a PR, run `pnpm lint` and `pnpm format:check`;
note any test limitations explicitly. PRs should include a short summary, linked issue when applicable, impacted device
targets (`lg`, `tizen`, browser), and screenshots or video for visible UI changes.
