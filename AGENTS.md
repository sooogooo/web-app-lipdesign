# Repository Guidelines

## Project Structure & Module Organization
- Root React + TypeScript app (Vite).
- `App.tsx` main UI; `index.tsx` bootstraps; `index.html` mount point.
- `components/` reusable UI (e.g., `icons.tsx`).
- `services/` external integrations (e.g., `geminiService.ts`).
- `types.ts` shared types; `vite.config.ts` build config; `tsconfig.json` TypeScript options.
- Secrets via `.env.local` (see Security). No `src/` folder; imports use `@/` alias to repo root.

## Build, Test, and Development Commands
- `npm install` install dependencies.
- `npm run dev` start local server with HMR.
- `npm run build` production build to `dist/`.
- `npm run preview` preview the production build.

## Coding Style & Naming Conventions
- TypeScript, React 19, JSX runtime.
- Indent 2 spaces; keep semicolons; prefer single quotes.
- Components: PascalCase (`UserCard.tsx`). Hooks: `useX.ts`. Services: camelCase with `Service` suffix (`geminiService.ts`). Constants: SCREAMING_SNAKE_CASE.
- Imports: prefer `@/path` alias (configured in `vite.config.ts` and `tsconfig.json`).
- Keep components focused; colocate minimal styles/assets with the component.

## Testing Guidelines
- No test framework is set up yet. Recommended: Vitest + React Testing Library.
- Test file naming: `*.test.ts(x)` colocated next to source.
- Aim for critical-path coverage (services and complex components). Run via `vitest` when added.

## Commit & Pull Request Guidelines
- Commits: short, imperative summary (≤72 chars), optional body with rationale.
  Examples: `feat: add prompt controls`, `fix: guard null image data`.
- PRs: clear description, linked issues, before/after screenshots for UI, steps to reproduce/verify, and notes on trade-offs.
- Keep PRs small and focused; update docs when behavior changes.

## Security & Configuration Tips
- Create `.env.local` (not committed) with: `GEMINI_API_KEY=your_key`.
- Do not reference secrets directly in code; access via Vite env (`import.meta.env`) or defined constants.
- Never commit API keys or tokens; rotate on accidental exposure.
