---
name: seu-aims-saas-ui
description: >-
  SEU-AIMS UI design system grounded in the current department-admin experience.
  Use when designing, redesigning, or polishing any frontend UI (admin, student,
  lecturer) — layout, CSS, dashboards, tables, forms, charts, empty states. Follow
  the admin reference: calm Google Workspace / Material-adjacent product UI on
  native CSS tokens in global.css — not Tailwind/shadcn rewrites.
paths: frontend/**/*.{js,jsx,css,html},SEU-AIMS/frontend/**/*.{js,jsx,css,html}
---

# SEU-AIMS UI — Admin reference pattern

The **department administrator UI is the visual source of truth** for the whole product. Student and lecturer screens should feel like the same app: same canvas, panels, typography, spacing, tables, pills, and hover language — not a separate “marketing” or “chat app” theme.

## Stack (do not change unless asked)

- React + Vite, routes unchanged
- **One stylesheet system:** `frontend/src/styles/global.css` (CSS variables + classes)
- Shared primitives: `frontend/src/ui/` — `PageHeader`, `Panel`, `StatCard`, `EmptyState`, `AttentionList`, `PageSkeleton`, `StatIcon`, `ActionButton`, `OperationNotice`
- App chrome: `frontend/src/app/AppShell.jsx` (light rail `#f0f4f9`, content on `#f1f5fb`)
- Do **not** introduce Tailwind, shadcn, or a second design system mid-task

## How admin UI looks (read this before changing any page)

### Overall feel

- **Operational workspace**, not a landing page: white surfaces on a cool gray-blue page background (`--color-bg: #f1f5fb`)
- **Air and rhythm:** section gap ~`1.65rem` (26px) on dashboards; panels breathe with `1.35rem` internal padding
- **One primary accent:** Google-style blue (`--brand-600` / `--brand-700`) for links, active tabs, icons, chart fills
- **Neutrals dominate:** slate text hierarchy (`--slate-900` titles, `--slate-600` kickers/labels, `--slate-500` meta)
- **Elevation is whisper-quiet:** `--shadow-card` on panels; hover may add `--shadow-xs` or `--shadow-1` — never heavy glow or glassmorphism stacks

### Color discipline (match admin — critical)

Admin UI is **not multi-color decorative**. Semantic color appears only where meaning requires it:

| Role | Usage | Typical tokens |
|------|--------|----------------|
| Default surface | Panels, list rows, tables | `#ffffff`, `--slate-50`, `#f8fafd` |
| Primary action / link | Tabs active, chevrons, chart bars | `--brand-50` bg tint, `--brand-700` text, `--brand-300` hover border |
| Active / OK | Active semester, verified status | `--emerald-50`, `--emerald-700` (small pills only) |
| Watch / pending | Non-zero counts needing review | `--amber-50`, `--amber-100` border, `--amber-700` text |
| Alert / danger | Failed jobs, blocked rows | `--danger-50`, `--danger-100`, `--danger-700` |

**Allowed gradients (admin uses sparingly — copy the same restraint):**

- Stat cards with `tone="watch"` or `tone="alert"`: **very subtle** top-to-bottom fade (`#fef9eb → #fff` or `#fdf2f1 → #fff`) — not rainbow headers
- Vertical bar charts (`.ops-vchart__fill`): single-hue blue (or amber for E-grade warn variant) — **chart data only**, not card backgrounds
- **Do not add** purple/indigo themes, hero gradients, per-card color themes, or gradient text

When improving student UI, **reuse admin classes** (`.panel`, `.stat-card`, `.overview-stat-tile`, `.bar-chart`, `.ops-vchart`) instead of inventing new gradient-heavy “insight heroes.”

### Typography

- Page title: `.page-header h1` — display weight, tight tracking
- Purpose line: `.page-header__purpose` — muted explanatory sentence under title
- Panel kicker: `.panel__kicker` — **uppercase**, ~0.72rem, `--brand-700`
- Panel title: `.panel h2` — ~1.1rem, strong, slate-900
- Section lead: `.panel-lead` — short context before content
- Big metrics: `.stat-card__value`, `.figure-line`, `.intel-card__value` — tabular nums, bold, ~1.3–1.75rem
- Table/meta: 0.78–0.84rem, `--slate-500`

### Core building blocks

**Page shell**

```jsx
<section className="admin-page record-page">  {/* or home-dashboard admin-home */}
  <PageHeader title="…" purpose="…" meta="…" actions={…} />
  {/* tabs, filters, panels */}
</section>
```

**Panel** — default grouped content:

- White card, `1px solid var(--color-border)`, `--radius-lg`, `--shadow-card`
- Optional `tone="attention"` for amber-tinted attention panel (student home uses this sparingly)
- Footers: `.panel-footnote` with top border and `Link` + `·` separators

**Stat row** — top-of-page KPIs:

- `.stat-row` — responsive auto-fit grid, ~11.5rem min column
- `.stat-card` — white, icon in brand circle, uppercase label
- Linkable via `to=`; tones: `watch` / `alert` only when count &gt; 0 (border + subtle tint)

**Tabs** — `.tab-nav`:

- Pill track on `#e4ebf5`, inactive transparent buttons, **active = white pill** + brand text + light shadow
- Academic admin uses many tabs; People uses two (`Students` / `Lecturers`)
- Academic admin buttons: class `tab-nav__tab is-active`

**Tables** — operational default:

- Wrap in `.table-scroll` (bounded height, internal scroll, **sticky thead**)
- `.data-table` — compact cells, nowrap where needed; status as `.status-pill` variants
- Result imports: `.review-sheet`, `.sheet-pill--ok|warn|bad` for cell states

**Lists instead of tables** (people directory, shortcuts):

- `.entity-list` + row links, or `.action-center`, `.shortcut-grid`, `.health-list`, `.calendar-preview`

**Empty / loading / error**

- `EmptyState` with one primary link action
- `PageSkeleton` variants: `dashboard`, `detail`, `list`, `record`, `workspace`
- `.form-error` with `role="alert"`; retry via plain `<button type="button">`

**Status pills** — `.status-pill` + `--ok | --pending | --danger | --info | --warning | --muted`

---

## Admin page map (structure to mirror)

| Route / page | Section classes | Layout pattern |
|--------------|-----------------|----------------|
| `/admin` — `AdminDashboardPage` | `home-dashboard admin-home` | `PageHeader` → 6× `StatCard` → `admin-home__grid--primary` (stack + overview panel) → full-width Workspace shortcuts → `admin-home__grid--secondary` (calendar + health) → Academic intelligence panel |
| `/admin/academic` — `AcademicAdminPage` | `admin-page record-page` | `PageHeader` → long `tab-nav` → `admin-tab-panel` (Overview: CatalogImportPanel + 3×3 `stat-row--overview` StatCards + diagnostics Panel) OR `admin-crud` (form panel + table panel) per tab |
| `/admin/people` — `AdminPeoplePage` | `record-page` | Tabs → `filter-bar--search` → single `Panel` with `entity-list` or skeleton |
| `/admin/results` — `AdminResultsPage` | `admin-page record-page results-imports` | Stats + multi-panel import workflow; pivot `review-sheet` tables |
| `/admin/ca` — `AdminCaPage` | `admin-page record-page` | Stat row + tabbed/panel queues, window forms |
| `/admin/resources` — `AdminResourcesPage` | `admin-page record-page` | Single panel + `table-scroll` |
| `/admin/offerings-health`, study-room moderation, batch detail | `admin-page record-page` (+ modifiers) | Header + panels/tables |
| `/admin/ops` — `AdminObservabilityPage` | `record-page` | Stat cards + metric panels (counts only) |
| Student/lecturer detail | `record-page` | Stat row + `Panel` + `record-dl record-dl--inline` + `AccountActions` |

---

## Department dashboard (`admin-home`) — detailed composition

Reference: `frontend/src/modules/admin/AdminDashboardPage.jsx` + `.admin-home*` / `.action-center*` / `.overview-*` in CSS.

1. **Stat row (6 cards)** — department scale counts; alert/watch tones on imports, E(CA), CA apps
2. **Primary grid (≥1000px: 1.1fr | 1fr)**
   - **Left stack**
     - **Action center** — `.action-center__item` rows: icon box, title/meta, count, chevron; `--alert` / `--watch` row tint when urgent
     - **Grade & coverage distribution** — `.mini-chart-pill` trio (flat `--slate-50` boxes, **no gradient**) + `.ops-vchart` vertical bars
   - **Right: Academic overview**
     - `.overview-head` + dept badge (solid `--brand-700` pill) + summary pill (`--brand-50`)
     - **Active years matrix:** `.overview-year-grid` 2×2 cards, `.overview-sem-pill` with green dot
     - **Four linked stat tiles:** `.overview-stats-grid` → `.overview-stat-tile` (hover: `#f4f8fe`, slight lift)
3. **Workspace** — `.shortcut-grid.shortcut-grid--compact` → `.shortcut-tile` with `StatIcon`, title, meta, chevron
4. **Secondary grid (2 columns)** — calendar preview list + system health list
5. **Academic intelligence** — `.intel-card`, `.intel-grid`, `.grade-bars`, `.intel-note` (amber or brand-50 note boxes — flat, not gradient banners)

---

## Academic admin — detailed composition

Reference: `AcademicAdminPage.jsx`

- **Overview tab:** vertical stack with **`1.65rem` gap** (`admin-tab-panel`) — import panel, then stat grid, then diagnostics panel
- **CRUD tabs:** `.admin-crud` — sidebar form panel + main table (stacked on narrow viewports)
- **Overview StatCards:** 3-column row at `900px+` (`stat-row--overview`); click switches tab
- **Catalog import:** standard `Panel` + actions + report lists (no custom chrome)

---

## CSS classes to reuse (prefer extend over duplicate)

**Layout:** `home-dashboard`, `admin-home`, `admin-home__grid`, `admin-home__stack`, `dashboard-grid`, `record-page`, `admin-page`, `admin-tab-panel`, `admin-crud`, `filter-bar`, `filter-bar--search`

**Dashboard widgets:** `action-center`, `mini-chart-summary`, `mini-chart-pill`, `ops-vchart`, `overview-head`, `overview-year-grid`, `overview-year-card`, `overview-sem-pill`, `overview-stats-grid`, `overview-stat-tile`, `shortcut-grid`, `calendar-preview`, `health-list`, `intel-grid`, `intel-card`, `grade-bars`, `preview-subhead`, `panel-subsection`

**Student-safe equivalents:** use the same `Panel` / `stat-row` / `bar-chart` / `stack-list` / `entity-list` / `offering-card` patterns — **not** separate gradient “insight hero” systems unless they match admin tints exactly

**Charts (lightweight):**

- Department vertical: `.ops-vchart` (+ `--warn` fill for E-type codes)
- Horizontal distribution: `.bar-chart` or `.grade-bars` (solid `--brand-500` fill)
- GPA trajectory (student): if charts are needed, style like `ops-vchart` / `grade-bars` — blue single-hue line/area, dashed target line in amber — **no multi-stop background gradients on panels**

---

## Interaction rules

- Hover: border → `--brand-300`, background → `--brand-50` or `#f4f8fe`, optional `--shadow-xs`
- **No** scale animations, parallax, or scroll-jacking
- Transitions ~0.15–0.2s on border/background/box-shadow only
- Focus: preserve existing `:focus-visible` / keyboard patterns
- Icons: `StatIcon` SVG set — not emoji

---

## Workflow for UI tasks

1. **Open the closest admin screen** in code and CSS; match its section class + panel stack
2. **Extend `global.css`** with new classes only when no admin analogue exists; name with the same BEM-ish prefix style (`overview-`, `action-center-`, `intel-`)
3. Compose with `PageHeader` + `Panel` + `StatCard` + `EmptyState`
4. Keep **loading, empty, error+retry** on every data view
5. After changes, ensure tables still use `.table-scroll` + sticky headers on long lists

---

## Anti-patterns (do not introduce on student/lecturer work)

- Rainbow cards, per-section gradient backgrounds, or “AI purple” palettes
- Multiple competing accent colors (teal + purple + pink) on one page
- Decorative gradients on notification/performance/chat cards — admin uses **flat** tinted boxes (`--slate-50`, `--brand-50`, `--amber-50`)
- Card-in-card stacks more than one level deep without admin precedent
- Rewriting pages in a new component library
- Inline `style={{}}` for colors/spacing when a token/class exists
- Breaking RBAC copy, routes, or API contracts

---

## Product rules (unchanged)

- Backend authorization is authoritative
- Login = email; registration number = academic identity only
- Roles: `STUDENT`, `LECTURER`, `DEPARTMENT_ADMINISTRATOR`
- Preserve CSRF/cookie auth flows

---

## Related skills (polish only — admin pattern wins on conflict)

- `.agents/skills/minimalist-ui` — density and calm
- `.agents/skills/redesign-existing-projects` — audit before rewrite
- Do **not** let `high-end-visual-design` override admin color discipline (no extra gradients/motion)

When **minimalist-ui** or **high-end-visual-design** conflict with this document, **this admin-reference skill takes precedence** for SEU-AIMS.
