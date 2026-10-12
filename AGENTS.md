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
- `pnpm test:tv`: run browser navigation tests with the Fire TV, Tizen, and webOS device configs.

### TypeScript 6 / 7 side-by-side

TypeScript 7 dropped the programmatic API that `typescript-eslint` imports, so `package.json` carries two npm
aliases: `typescript` resolves to `@typescript/typescript6` (the API `typescript-eslint` loads, exposed on the CLI
as `tsc6`) and `@typescript/native` resolves to the real `typescript@7` (which owns the `tsc` binary). So `pnpm tsc`
type-checks with 7.x while `pnpm lint` keeps working against the 6.x API. Do not "simplify" `typescript` back to a
plain `^7` range — that silently kills ESLint. Collapse both aliases into one dependency once typescript-eslint
supports TS >= 7.1 (typescript-eslint#10940).

### `@solidtv/renderer` 2.x is paired with a `@solidtv/solid` prerelease

The two move together and neither range may be bumped alone. Renderer 2.x is only supported by
`@solidtv/solid@1.7.0-0`; the newest _stable_ wrapper (1.6.5) still declares
`peerDependencies: { "@solidtv/renderer": "^1.10.1" }`. So `pnpm up --latest` on `@solidtv/solid` will quietly drop
back to 1.6.5 and leave an unmet peer against renderer 2.x. Re-pin both, or move both back to renderer `^1.10.1` plus
solid `^1.6.5`.

What 2.x changed here, in case either file needs touching again:

- `./webgl` and `./canvas` subpath exports are gone. `devices/common/index.ts` no longer picks a `renderEngine` or
  `fontEngines` — 2.x ships one pipeline, WebGL with SDF text.
- **There is no in-process Canvas2D fallback any more.** The old config chose `CanvasCoreRenderer` when
  `profile.hasWebGL` was false (a 1st-gen Fire TV Stick can lose GL after a Fire OS update). `@solidtv/solid` offers a
  DOM renderer in its place, but it sits behind the `SOLIDTV_DOM_RENDERING` build global and is compiled out by
  default, so it is a separate build, not a runtime branch. `profile.hasWebGL` is still detected but no longer changes
  any renderer setting.
- `registerShaderType` moved off `stage.shManager` onto the renderer itself. `src/app/lightning.ts` now calls
  `registerDefaultShaders()` from `@solidtv/solid`, which registers the same eight names the app used to wire by hand.

Payload, measured on the firetv build: the renderer chunk grows 199 KB → 248 KB, while total JS drops
1,119 KB → 1,096 KB, because dropping the Canvas engines and the hand-rolled shader imports removes more than 2.x adds.

## Coding Style & Naming Conventions

Use TypeScript and SolidJS with 2-space indentation, double quotes, semicolons, and trailing commas in multiline
structures. Keep page and component files in PascalCase (`Home.tsx`, `FavoriteButton.tsx`). Use camelCase for utility
and config files (`api.ts`, `storage.ts`, `contentMeta.ts`). Import style: use the `@/` alias for anything outside the
current directory; plain relative imports (`./auth`, `../playerState`) only within the same feature/folder. `#devices`
maps to platform-specific code. `tsconfig.json` is `strict`; avoid adding new `any` usage even where ESLint currently
permits it.

## Testing Guidelines

Vitest is the unit test runner (`vitest.config.ts`, jsdom environment). Place tests beside the code they cover using
`*.test.{js,jsx,ts,tsx}` and run them once with `pnpm exec vitest run`.

Playwright runs `*.e2e.ts` beside the code they cover via `pnpm test:tv`. It uses the installed Chrome, the real
Lightning scene and device configs, and local API fixtures without credentials. `src/test/tvScene.ts` reads the
actual focus manager; inspect ancestry rather than screen coordinates or forwarded focus styles. Add navigation
regressions here when fixing remote input or asynchronous focus restoration. These tests cover browser behavior;
native AVPlay, Capacitor events, codecs, and device memory still require emulator/hardware validation. Traces and
screenshots on failure go to `tmp/playwright-results`.

## Commit & Pull Request Guidelines

Recent history uses emoji-prefixed conventional subjects such as `🎯 feat entry: ...`, `🔧 chore: ...`, and `📝 docs: ...`.
Keep commits small, imperative, and scoped to one concern. Before opening a PR, run `pnpm lint` and `pnpm format:check`;
note any test limitations explicitly. PRs should include a short summary, linked issue when applicable, impacted device
targets (`lg`, `tizen`, browser), and screenshots or video for visible UI changes.
