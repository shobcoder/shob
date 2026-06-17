---
name: ui-ux-pro-max
description: "UI/UX design intelligence expert for web and mobile applications. Use when designing interfaces, selecting color palettes, typography, visual styles, building landing pages, dashboards, or reviewing code for UX issues. Covers 50+ design styles, 97 color palettes, 57 font pairings, 99 UX guidelines, 25 chart types across 9 tech stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui)."
---

# UI/UX Pro Max - Design Intelligence Expert

Comprehensive UI/UX design guide for web and mobile applications. Provides intelligent design recommendations based on product type, industry, and user requirements. Reference these guidelines when designing new UI, choosing colors and typography, reviewing code for UX issues, or implementing features.

---

## Workflow

### Step 1: Analyze User Requirements

Extract from user request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page, etc.
- **Style keywords**: minimal, playful, professional, elegant, dark mode, etc.
- **Industry**: healthcare, fintech, gaming, education, beauty, etc.
- **Tech stack**: React, Vue, Next.js, Svelte, Flutter, or html-tailwind (default)

### Step 2: Generate Design System

Consult the reference data below (and CSV files in `data/`) for:
- Recommended patterns and section layouts
- Primary visual style with effects
- Color palette (primary, secondary, CTA, background, text)
- Typography pairing (heading + body fonts with Google Fonts URL)
- Key effects and anti-patterns to avoid

### Step 3: Implementation Guidelines

Apply stack-specific best practices from the reference data:
- HTML/Tailwind utilities, responsive breakpoints
- React hooks, state management, performance patterns
- Vue Composition API, Pinia state
- Flutter widgets, themes, navigation
- Accessibility requirements (WCAG compliance)

### Step 4: Pre-Delivery Verification

Run through all checklists (visual quality, interaction, light/dark mode, layout, accessibility) before delivering any UI code.

---

## Priority Rules

| Priority | Category | Impact |
|----------|----------|--------|
| 1 | Accessibility | CRITICAL - Color contrast 4.5:1, focus states, aria-labels |
| 2 | Touch & Interaction | CRITICAL - 44x44px touch targets, cursor-pointer |
| 3 | Performance | HIGH - Image optimization, lazy loading |
| 4 | Layout & Responsive | HIGH - Mobile-first, viewport meta |
| 5 | Typography & Color | MEDIUM - Line height 1.5-1.75, readable fonts |
| 6 | Animation | MEDIUM - 150-300ms duration, transform-only |
| 7 | Style Selection | MEDIUM - Match style to product type |

---

## Quick Style Selector by Product Type

| Product Type | Primary Style | Secondary Styles | Color Mood |
|--------------|---------------|------------------|------------|
| SaaS (General) | Minimalism | Flat Design, Glassmorphism | Trust blue + accent contrast |
| E-commerce | Neo-Brutalism | Bento Grid, Dark Mode | Brand primary + success green |
| E-commerce Luxury | Luxury Minimal | Dark Mode, Elegant | Premium black + gold accents |
| Healthcare | Soft Minimalism | Flat Design, Organic | Calm blue + health green |
| Fintech/Crypto | Cyberpunk | Dark Mode, Glassmorphism | Dark tech + vibrant accents |
| Gaming | Neon Glow | Cyberpunk, Dark Mode | Vibrant + neon + immersive |
| Portfolio/Creative | Editorial | Brutalism, Asymmetric | Brand primary + artistic |
| Dashboard | Corporate Tech | Flat Design, Data-Dense | Cool→Hot gradients + neutral |
| AI/Chatbot | Aurora Gradients | Glassmorphism, Dark Mode | Neutral + AI Purple (#6366F1) |
| Beauty/Spa/Wellness | Organic Shapes | Soft Minimalism, Elegant | Soft pastels + natural tones |

---

## Color Palettes by Industry

### SaaS / Business
| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | #2563EB | blue-600 |
| Secondary | #3B82F6 | blue-500 |
| CTA | #F97316 | orange-500 |
| Background | #F8FAFC | slate-50 |
| Text | #1E293B | slate-800 |
| Border | #E2E8F0 | slate-200 |

### E-commerce Luxury
| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | #1C1917 | stone-900 |
| Secondary | #44403C | stone-700 |
| CTA | #CA8A04 | yellow-600 |
| Background | #FAFAF9 | stone-50 |
| Text | #0C0A09 | stone-950 |
| Border | #D6D3D1 | stone-300 |

### Healthcare
| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | #0891B2 | cyan-600 |
| Secondary | #22D3EE | cyan-400 |
| CTA | #059669 | emerald-600 |
| Background | #ECFEFF | cyan-50 |
| Text | #164E63 | cyan-900 |
| Border | #A5F3FC | cyan-200 |

### Fintech / Crypto
| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | #F59E0B | amber-500 |
| Secondary | #FBBF24 | amber-400 |
| CTA | #8B5CF6 | violet-500 |
| Background | #0F172A | slate-900 |
| Text | #F8FAFC | slate-50 |
| Border | #334155 | slate-700 |

### Gaming
| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | #7C3AED | violet-600 |
| Secondary | #A78BFA | violet-400 |
| CTA | #F43F5E | rose-500 |
| Background | #0F0F23 | custom-dark |
| Text | #E2E8F0 | slate-200 |
| Border | #4C1D95 | violet-900 |

### AI / Chatbot Platform
| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | #7C3AED | violet-600 |
| Secondary | #A78BFA | violet-400 |
| CTA | #06B6D4 | cyan-500 |
| Background | #FAF5FF | violet-50 |
| Text | #1E1B4B | indigo-950 |
| Border | #DDD6FE | violet-200 |

### Beauty / Spa / Wellness
| Role | Hex | Tailwind |
|------|-----|----------|
| Primary | #DB2777 | pink-600 |
| Secondary | #F472B6 | pink-400 |
| CTA | #059669 | emerald-600 |
| Background | #FDF2F8 | pink-50 |
| Text | #831843 | pink-900 |
| Border | #FBCFE8 | pink-200 |

---

## Typography Pairings

### Professional / Corporate
**Heading:** Inter | **Body:** Inter
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```
*Best for: SaaS, dashboards, business apps*

### Elegant / Luxury
**Heading:** Playfair Display | **Body:** Lato
```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Lato:wght@400;700&display=swap');
```
*Best for: Luxury brands, editorial, high-end e-commerce*

### Modern / Tech
**Heading:** Space Grotesk | **Body:** DM Sans
```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;700&display=swap');
```
*Best for: Tech startups, fintech, AI products*

### Friendly / Playful
**Heading:** Poppins | **Body:** Open Sans
```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Open+Sans:wght@400;600&display=swap');
```
*Best for: Education, consumer apps, lifestyle brands*

### Editorial / Creative
**Heading:** Fraunces | **Body:** Source Sans 3
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Source+Sans+3:wght@400;600&display=swap');
```
*Best for: Blogs, magazines, portfolios*

### Healthcare / Wellness
**Heading:** Outfit | **Body:** Nunito
```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Nunito:wght@400;600&display=swap');
```
*Best for: Healthcare, wellness, medical apps*

---

## Visual Styles Reference

### Minimalism
- **Colors:** Monochrome + 1 accent, high whitespace
- **Effects:** Subtle shadows, clean borders, micro-interactions
- **Best For:** SaaS, productivity, professional apps
- **Keywords:** clean, simple, whitespace, subtle, elegant

### Glassmorphism
- **Colors:** Translucent layers, blur effects, gradient backgrounds
- **Effects:** backdrop-blur, bg-white/10, soft shadows
- **Best For:** Modern dashboards, music apps, portfolios
- **Keywords:** glass, blur, translucent, frosted, layered

### Neumorphism
- **Colors:** Soft pastels, same-hue shadows (dark/light)
- **Effects:** Inset shadows, extruded elements, soft depth
- **Best For:** Control panels, calculators, music players
- **Keywords:** soft, embossed, extruded, tactile, 3D-soft

### Dark Mode
- **Colors:** Dark backgrounds (#0F172A), light text, accent colors
- **Effects:** Subtle borders, glows on focus, reduced eye strain
- **Best For:** Developer tools, media apps, gaming
- **Keywords:** dark, night, low-light, contrast, modern

### Bento Grid
- **Colors:** Card-based with distinct backgrounds per section
- **Effects:** Grid layouts, varying card sizes, clear hierarchy
- **Best For:** Feature showcases, portfolios, dashboards
- **Keywords:** grid, cards, modular, organized, showcase

### Aurora / Gradient Mesh
- **Colors:** Multi-color gradients, mesh blending, vibrant
- **Effects:** Animated gradients, color transitions, depth
- **Best For:** AI products, creative tools, landing pages
- **Keywords:** aurora, gradient, mesh, colorful, flowing

### Brutalism
- **Colors:** High contrast, raw colors, bold primaries
- **Effects:** Heavy borders, raw typography, intentionally rough
- **Best For:** Creative agencies, art portfolios, bold brands
- **Keywords:** raw, bold, stark, unpolished, striking

---

## Landing Page Patterns

### Hero-Centric (Conversion Focus)
**Sections:** Hero > Social Proof > Features > CTA
- Primary CTA above fold
- Trust badges near CTA
- Single focused message

### Feature-Forward (Product Demo)
**Sections:** Hero > Feature Grid > How It Works > Pricing > CTA
- Visual product demos
- Benefits over features
- Comparison tables for pricing

### Story-Driven (Brand Building)
**Sections:** Hero > Problem > Solution > Journey > Team > CTA
- Emotional connection first
- Customer success stories
- Brand narrative flow

### Social Proof Heavy (Trust Building)
**Sections:** Hero > Logos > Testimonials > Case Studies > CTA
- Client logos prominent
- Video testimonials
- Stats and numbers

---

## Chart Type Selection

| Data Type | Best Chart | When to Use |
|-----------|------------|-------------|
| Trend Over Time | Line Chart | Time-series, growth, progress |
| Compare Categories | Bar Chart | Rankings, comparisons |
| Part-to-Whole | Donut Chart | Percentages, proportions (≤5 items) |
| Correlation | Scatter Plot | Relationships, patterns |
| Geographic | Choropleth Map | Regional data, locations |
| Funnel/Flow | Funnel Chart | Conversion, process stages |
| Performance | Gauge/Bullet | KPIs, targets |
| Hierarchical | Treemap | Nested categories, proportions |

**Chart Color Guidance:**
- Primary data: #2563EB (blue-600)
- Success/Growth: #22C55E (green-500)
- Warning/Alert: #F59E0B (amber-500)
- Error/Decline: #EF4444 (red-500)
- Neutral: #94A3B8 (slate-400)

For detailed chart data (25 chart types with library recommendations, accessibility notes, and interactive levels), see `data/design-data.csv`.

---

## Accessibility Requirements (CRITICAL)

### Color Contrast
- **Normal text:** 4.5:1 minimum ratio
- **Large text (18px+):** 3:1 minimum ratio
- **Interactive elements:** Clear focus states

### Touch Targets
- **Minimum size:** 44x44px for touch devices
- **Spacing:** 8px minimum between targets

### Focus States
```css
/* Always visible focus ring */
:focus-visible {
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Form Labels
- Every input MUST have associated label
- Use `<label for="id">` or aria-label
- Error messages near the problem field

---

## Common UX Anti-Patterns (AVOID)

### Icons
- NO: Using emojis as UI icons
- YES: Use SVG icons (Heroicons, Lucide, Simple Icons)

### Hover States
- NO: Scale transforms that shift layout
- YES: Color/opacity transitions only

### Cursors
- NO: Default cursor on clickable elements
- YES: `cursor-pointer` on all interactive elements

### Light Mode Glass
- NO: `bg-white/10` (too transparent, invisible)
- YES: `bg-white/80` or higher opacity

### Z-Index
- NO: Random z-index values (999, 9999)
- YES: Defined scale: 10 (default), 20 (dropdown), 30 (modal), 50 (toast)

### Animations
- NO: Slow animations (>500ms) or layout-shifting
- YES: 150-300ms duration, transform/opacity only

---

## Stack-Specific Guidelines

### HTML + Tailwind CSS
- Use utility classes, avoid custom CSS
- Responsive: `sm:`, `md:`, `lg:`, `xl:` breakpoints
- Dark mode: `dark:` variant
- Always include `cursor-pointer` on buttons/links

### React
- Use `memo()` for expensive components
- Prefer `useMemo`/`useCallback` for stable references
- Avoid inline functions in render
- Use Suspense for code splitting

### Next.js
- Use `next/image` for automatic optimization
- Implement dynamic imports for heavy components
- Use `next/font` for optimized font loading
- Leverage Server Components where possible

### Vue 3
- Use Composition API with `<script setup>`
- Pinia for state management
- `defineProps` with TypeScript
- Lazy load routes with dynamic imports

### Flutter
- Use `const` constructors for static widgets
- `ListView.builder` for long lists
- Dispose controllers in `dispose()`
- Use `Theme.of(context)` for consistent theming

### SwiftUI
- Use `@State` for local state, `@StateObject` for reference types
- Prefer `.task` over `.onAppear` for async
- Use `LazyVStack` for long lists
- Support Dynamic Type for accessibility

For comprehensive stack-specific guidelines (99 rules across Flutter, SwiftUI, and more), see `data/stack-guidelines.csv`.

---

## Response Style

When designing interfaces:
1. **Present the design system** first with all recommendations
2. **Show color swatches** with hex values and usage
3. **Include Google Fonts import** code ready to use
4. **Provide code examples** following stack best practices
5. **Explain design decisions** with reasoning

---

## Pre-Delivery Checklist

### Visual Quality
- [ ] No emojis as icons (use SVG: Heroicons, Lucide, Simple Icons)
- [ ] All icons from consistent icon set
- [ ] Brand logos verified from official sources
- [ ] Hover states don't cause layout shift

### Interaction
- [ ] All clickable elements have `cursor-pointer`
- [ ] Hover states provide clear visual feedback
- [ ] Transitions are smooth (150-300ms)
- [ ] Focus states visible for keyboard navigation

### Light/Dark Mode
- [ ] Light mode text has sufficient contrast (4.5:1 minimum)
- [ ] Glass/transparent elements visible in light mode
- [ ] Borders visible in both modes

### Layout
- [ ] Floating elements have proper spacing from edges
- [ ] No content hidden behind fixed navbars
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile

### Accessibility
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not the only indicator
- [ ] `prefers-reduced-motion` respected

### Pre-Implementation
- [ ] Product type identified
- [ ] Visual style selected
- [ ] Color palette defined
- [ ] Typography pairing chosen
- [ ] Landing page pattern selected
- [ ] Accessibility requirements noted
- [ ] Tech stack guidelines reviewed
