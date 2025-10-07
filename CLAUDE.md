# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Overview

Rouh Spaces is a clean rebuild starting with a landing page. The previous complex version (with NestJS API, FastAPI AI service, Prisma, RLS, coordination blueprints, etc.) has been archived to `archive/old-complex-version` branch.

**Current Tech Stack:**
- **Web**: Next.js 14 + TypeScript + Tailwind CSS
- **UI**: Custom component library with Button, Card, Input components
- **Animation**: animejs for landing page animations
- **Monorepo**: pnpm workspaces + Turbo

## Commands

```bash
# Install dependencies
pnpm i

# Start development server (port 3000)
pnpm dev

# Build all packages
pnpm build

# Lint
pnpm lint

# Format code
pnpm format
```

## Structure

- `apps/web/` - Next.js application
  - `app/page.tsx` - Landing page
  - `app/layout.tsx` - Root layout
  - `app/globals.css` - Global styles
  - `lib/api.ts` - API URL constant (for future backend)

- `packages/ui/` - Shared UI components
  - `src/Button.tsx` - Button component
  - `src/Card.tsx` - Card component
  - `src/Input.tsx` - Input component

- `packages/config/` - Shared configurations (tsconfig, eslint, prettier)
- `packages/types/` - Shared TypeScript types

## Development Approach

**IMPORTANT**: This is a clean rebuild. Do not make assumptions based on the old code in the archive branch. Build features aligned with the user's vision, starting simple and adding complexity only when explicitly needed.

When building new features:
1. Start with the simplest possible implementation
2. Ask for clarification if the requirement is complex
3. Avoid over-engineering or adding "nice to have" features
4. Keep the codebase clean and focused

## Guidelines

- Use TypeScript for all code
- Follow existing code style (2-space indentation, camelCase variables)
- Keep components simple and focused
- Prefer composition over complexity
- Use Tailwind CSS for styling
- Test changes by running `pnpm dev` and checking http://localhost:3000
