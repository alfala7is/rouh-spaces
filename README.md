# Rouh Spaces

Clean slate rebuild of Rouh Spaces, starting with a landing page.

## Structure

```
/apps
  /web      # Next.js landing page
/packages
  /ui       # Shared UI components (Button, Card, Input)
  /config   # Shared configs (tsconfig, eslint, prettier)
  /types    # Shared TypeScript types
```

## Quick Start

1) Install dependencies:

```bash
pnpm i
```

2) Run the development server:

```bash
pnpm dev
```

The landing page will be available at http://localhost:3000

## Tech Stack

- **Web**: Next.js 14 + TypeScript + Tailwind CSS + animejs
- **Monorepo**: pnpm workspaces + Turbo
- **UI**: Custom component library (@rouh/ui)

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm format` - Format code with prettier

## Notes

The previous complex version with API, AI service, and coordination system has been archived to the `archive/old-complex-version` branch. This is a fresh start focusing on vision alignment.
