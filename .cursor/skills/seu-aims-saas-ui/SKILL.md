---
name: seu-aims-saas-ui
description: >-
  SEU-AIMS department LMS SaaS UI system. Use when designing, redesigning, or
  polishing frontend UI — login, app shell, dashboards, forms, tables, empty
  states, navigation, or CSS tokens. Enforces the existing React + CSS design
  system (not Tailwind/shadcn rewrites) and university product density.
paths: frontend/**/*.{js,jsx,css,html},SEU-AIMS/frontend/**/*.{js,jsx,css,html}
---

# SEU-AIMS SaaS UI

Department-level VLE/LMS product UI. Prefer calm enterprise SaaS over marketing/landing aesthetics.

## Stack constraints

- React + Vite frontend under `frontend/`
- Design tokens and components live in **native CSS**, primarily `frontend/src/styles/global.css`
- Shared primitives: `frontend/src/ui/` (`PageHeader`, `Panel`, `StatCard`, `EmptyState`, `AttentionList`)
- App chrome: `frontend/src/app/AppShell.jsx`
- Role nav: `frontend/src/ui/role-nav.js`
- Do **not** migrate to Tailwind/shadcn unless the user explicitly asks
- When using installed SaaS pattern skills (forms, tables, a11y), adapt patterns to this CSS system

## Design dials (Taste-aligned)

| Dial | Target | Why |
|------|--------|-----|
| VARIANCE | 3–4 | Structured product layouts, not asymmetric marketing |
| MOTION | 2–3 | Hover/focus transitions only; no heavy scroll/GSAP |
| DENSITY | 6–7 | Dashboards, tables, academic workflows |

## Visual direction

- Brand accent: university blue/sky (`--brand-600` / `#0284c7`) on slate neutrals
- Shell: dark rail (`--slate-900`) + light content (`--color-bg`)
- Typography: load a real font if changing type; avoid declaring Inter/Plus Jakarta without loading them
- Prefer SVG icons over emoji/`content: '🔍'` CSS hacks
- Prefer CSS classes over long inline `style={{…}}` blocks in shell/pages
- Cards/panels are allowed for interactive or grouped content; avoid card-for-everything decoration
- Auth/guest screens: brand panel + focused form; keep marketing feature lists minimal
- Light mode is current default; if adding dark mode, keep hierarchy/contrast parity

## Product rules (non-negotiable)

- Backend authorization is authoritative; UI never invents permissions
- Login identifier is **email**; registration number is academic identity only
- Roles: `STUDENT`, `LECTURER`, `DEPARTMENT_ADMINISTRATOR`
- Study Room is student-only in normal RBAC
- Preserve routes, API contracts, and CSRF/cookie auth flows

## Workflow

1. **Audit first** on existing screens (use `redesign-existing-projects` mindset)
2. Extend tokens/classes in `global.css` before inventing one-off styles
3. Reuse `PageHeader` / `Panel` / `StatCard` / `EmptyState` patterns
4. Keep loading, empty, and error+retry states for data views
5. Match responsive behavior already in `.app-shell--app` / mobile rail drawer
6. Pair with `minimalist-ui` or `high-end-visual-design` for polish; avoid brutalist/Awwwards motion packs

## Anti-patterns

- Purple-on-white / indigo gradient “AI default” themes
- Rewriting the whole UI in a new component library mid-task
- Decorative glow, pill spam, and stacked marketing chrome on operational pages
- Breaking a11y: skip link, focus-visible, keyboard nav, and alert roles already in use
- Hard-coding colors that ignore CSS variables

## Related installed skills

- Taste: `redesign-existing-projects`, `minimalist-ui`, `high-end-visual-design` (under `.agents/skills/`)
- Component patterns: `ui-design-brain` (under `.agents/skills/`)
- SaaS patterns (Cursor rules): `.cursor/rules/*.md` — tokens, layout, forms, tables, nav, auth, empty/loading, dashboard
