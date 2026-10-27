# SEU-AIMS UI contract (academic LMS workspace)

Product presentation for the department VLE/LMS. Later screens, including Prompt 21, must follow this document.

Tone: **academic LMS workspace** — teal rail, light canvas, rounded work cards. A faculty system that is pleasant to use, not a 1998 intranet and not a purple SaaS kit.

## Product feel

Screens should feel like a well-made department learning workspace: a persistent rail, a quiet top bar, cards you can scan, tables for records.

They must not feel like a marketing site, Linear, Notion, or a generated “student success” admin kit.

Voice is short and literal. Use [terminology.md](../terminology.md): CA Recovery, subject offering, registration number, Department Administrator. No slogans. No “Welcome back”.

## Anti-template rules

Do not introduce Inter/Poppins/Nunito from a CDN, purple or neon, button gradients, glassmorphism, fake KPI growth arrows, invented charts, dark-mode toggles, illustrations, emoji headings, fake crests, or stock campus photos.

A left workspace rail is allowed. Icon-only navigation is not. Counts on homes must come from existing APIs.

## Visual system

Tokens are three-layer: primitive values, semantic purpose aliases, then component aliases (`--button-bg`, `--rail-bg`). Screens reference semantic/component names; hex lives only in primitives.

| Layer | Examples | Use |
|---|---|---|
| Primitive | `--teal-800`, `--ink-900`, `--space-4` | Raw brand and scale |
| Semantic | `--color-accent`, `--color-text-muted`, `--space-between` | Purpose (between-group gap is 2× within-group) |
| Component | `--rail-bg`, `--button-bg`, `--panel-padding` | Shell and controls |

Compatibility aliases (`--paper`, `--ink`, `--band`) still map onto the semantic layer.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#e8eef0` | Canvas |
| `--ink` / `--ink-2` / `--ink-3` | `#12202a` / `#3a4a52` / `#5a6a72` | Primary, secondary, tertiary text |
| `--band` / `--band-deep` | `#0f3d3e` / `#0b2f30` | Rail and primary actions (one accent) |
| `--rule` | `#cfd8dc` | Hairlines |
| `--surface` | `#ffffff` | Cards and tables |
| `--attention` | `#f7f0ea` | Priority panel only |
| `--danger` | `#8a1f1f` | Errors and attention rule |
| `--radius` | `12px` | Surfaces; controls use `8px` |

Type: `Segoe UI, system-ui, sans-serif` at 16px body. Headings 30 / 18. No webfont CDN (CSP `'self'`). Purpose copy caps at ~60 characters. Tabular numbers on counts.

Motion: none except `:focus` and the mobile rail slide (honours reduced motion). No page gradients.

## Shell

## Shell

```text
[ Rail: SEU-AIMS · primary · more · user ]
[ Top bar: search affordance · notifications ]
[ Main workspace ]
```

Guest (sign-in): teal brand column + centred form card.

Active nav: filled rail item, not a candy pill in the content.

## Components

`PageHeader`, `Panel`, `StatCard` (real figures only), `.data-table`, `.entity-list`, form errors next to fields, one-sentence empty states.

Study Room stays a conversation workspace, not a consumer messenger skin.

## Behaviour

- Login: 401 → invalid email or password; 403 CSRF → refresh and retry; 429 → too many attempts, wait.
- Loading text stays; no skeleton shimmer.
- Empty and forbidden copy is one sentence. No stack traces.
- Do not change routes, roles, Study Room student-only, result identity, CA approval, or GPA presentation.
