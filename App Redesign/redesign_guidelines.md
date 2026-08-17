# Titan Redesign System: Patterns and Guidelines

This document outlines the core UI aesthetics, design tokens, component specs, responsiveness patterns, and interactive behaviors developed for the **Titan Redesign**. It is formatted to serve as a complete system-prompt context or reference guide for any LLM working on this codebase.

> **Current implementation contract:** Before building a CRM surface, read
> `design-system/DESIGN-SYSTEM.md` and `design-system/registry.json`. Their registered
> patterns are mandatory when a task matches them. In particular, use the Modal dialog
> pattern for short bounded work that retains page context, and Full-page settings for
> sustained or multi-section configuration with a cold-loadable route. This older visual
> guide remains aesthetic ground truth but does not replace those application patterns.

---

## 1. Core Aesthetic Principles

* **Elevation-Based Layouts**: Use elevation card shadows and natural spacing margins to separate visual segments rather than heavy borders.
  * **Shadow Token**: `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.01);`
  * **Border Removal**: Avoid horizontal lines (`border-bottom` or `border-top`) separating email listings, headers, or sidebar menus.
* **Unified 6px Squircle Highlight**:
  * Active highlights for inbox list tabs, top toolbar action buttons, and Tasks side panel tabs must use a consistent **`6px` border-radius** (not sharp rectangles, and not fully-rounded `9999px` capsules).
  * Inactive state hover backgrounds use a consistent **`6px` border-radius** as well.
* **Natural Spacing Margins**: Ensure layout elements have breathing room and sit equidistant from borders (e.g. toggle buttons positioned exactly `12px` from all outer bounds inside parent headers).

---

## 2. Color System & States

* **Primary Active Blue**: `#eff6ff` (background fill), `#1a73e8` / `#2170f4` (text/active outlines).
* **Neutral Hover Grey**: `#f4f5f8` (applied to read email listings, task items, inactive buttons).
* **Deep Hover Grey**: `#e2e6eb` (applied to badge pill hover states).
* **Background Dark Gray (Text)**: `#202124` (used for clean, readable high-contrast titles instead of generic `#333`).
* **Metadata Gray**: `#5f6368` (used for quiet descriptions, secondary tags, or subtitles).
* **Border Lines (Soft)**: `#f4f5f8` or `#eef0f2` (use extremely sparsely and only when physical guides are strictly required).

---

## 3. Interactive Component Specifications

### A. The "Add Action" Card (e.g., Add a Task Button)
* **Visual Presentation**: Framed as a prominent full-width card styled with a light dashed border instead of a generic button link.
  * **Style**: `background: #eff6ff; border: 1px dashed #bfdbfe; border-radius: 8px; padding: 7px 14px;`
  * **Hover Transition**: `background: #dbeafe; border-color: #3b82f6;`
  * **Layout**: Uses `flex: 1` inside action rows to expand and fill available width next to utility icon buttons.

### B. Utility Icons and Action Buttons (Maximize, More, Settings)
* **Geometry**: Action icons on the same row as cards should match card heights exactly (e.g., `32px * 32px` bounding box for icons next to `32px` tall cards).
  * **Style**: `width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center;`
  * **Hover State**: `background: #f4f5f8;`
  * **Detailed Asset Fills**: Do not apply flat color filters (like blue color masks) to active/selected utility icons. Preserving multi-color details inside SVGs makes the interface feel premium; rely instead on the `#eff6ff` highlight container background to designate state.

### C. Padded Borderless Badges (Tags & Metadata)
* **Style**: Borderless, padded squircle pills.
  * **Style**: `background: #f4f5f8; border: none; padding: 5px 12px; border-radius: 100px; color: #5f6368;`
  * **Hover State**: `background: #e2e6eb; color: #202124;`

### D. Soft-State Checkboxes
* **Idle State**: Apply an opacity mask to keep inactive interactive indicators subtle.
  * **Style**: `opacity: 0.5; transition: opacity 0.15s ease;`
  * **Hover State**: `opacity: 1.0;`

---

## 4. Layout & Motion Behaviors

### A. Focus Mode (Zen Mode) & Sidebar Collapse
* **Trigger**: Expanding the reading pane/thread view should trigger Focus Mode.
* **Left Sidebar**: Automatically collapses from its default state (`250px` wide) to a compact, icon-only layout (`64px` wide). Exiting Focus Mode restores the left sidebar to its expanded state.
* **Top Toolbar**: In Focus Mode, the search bar and compose button animate smoothly as they transition center-stage.
* **Transition Token**: `transition: width 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease;`

### B. Right Utility Sidebar (Compactified App Dock)
* **Idle/Default State**: The right utility sidebar (`#tasks-panel`) never hides completely. It shrinks to a narrow **`56px` compact dock** showing primary app icons (Calendar/Tasks) stacked vertically.
* **App Switcher Toggles**:
  * Clicking an app icon in the compact dock expands the panel to **`334px`** and loads that view.
  * Clicking the active app button again collapses the panel back to its compact `56px` state.
* **The Chevron Collapse Motion**:
  * When the panel is expanded, a vertical slide-in **Collapse Chevron button** appears at the very top of the compact dock.
  * The collapse button transitions smoothly from `height: 0px; scale: 0; opacity: 0` to `height: 36px; scale: 1; opacity: 0.7`.
  * Because the compact dock is a flexbox column, the chevron pushes all app buttons down vertically, providing clear visual feedback that the panel is open. Clicking the chevron collapses the panel back to `56px`.

### C. Reveal Animations: Never Gate on `display: none`
* **The Problem**: Content hidden with `display: none` inside a panel that also animates open (e.g. `width: 0 → 440px`) pops in fully-laid-out the instant it's un-hidden, at the same moment the container is still near its collapsed size. Since `display` cannot be transitioned, the browser does a "cold start" layout of the whole subtree in one frame, reading as a stutter/pop right at the start of the open animation.
* **The Solution**: Hide with `opacity` + `visibility` + `pointer-events` instead, so the content stays laid out (warm) the entire time and only its paint state changes:
  * **Style**: `opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.2s ease, visibility 0.2s ease;`
  * Give the *reveal* direction a short `transition-delay` (e.g. `0.12s`) so content only starts fading in once the container has already opened up some room — it should never be visible while still visually squeezed. The *hide* direction should have no delay; disappear immediately when collapsing.
  * Also check that every property the collapsed state touches (padding, border color, etc.) is included in the container's `transition` list — anything left out snaps instantly and desyncs from the width animation.

---

## 5. Responsive Engineering Guidelines

### A. Flexbox Truncation Rules (Avoiding Text Overlap)
* **The Problem**: Metadata tags/icons inside listing tiles overlapping subject text on narrower viewports.
* **The Solution**: Avoid absolute positioning on metadata wrappers. Always layout listings using standard flexbox flow:
  * **Container**: `display: flex; align-items: center; overflow: hidden; min-width: 0;`
  * **Text/Title Wrapper**: `flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
  * **Metadata Group**: `flex-shrink: 0; margin-left: auto;`
  * This guarantees that the text element automatically truncates with an ellipsis before it reaches the boundaries of the metadata icons.

### B. Visual Size Compensation (SVG Padding Disparities)
* **The Problem**: Different SVG assets rendered side-by-side inside identical layout containers appearing visually mismatched because of varying internal canvas margins (built-in SVG paddings).
* **The Solution**: Apply individual adjustments to image bounding boxes inside the CSS to normalize their actual visual shape sizes:
  * **Example**: Calendar SVGs (`40x40` viewBox with `30px` design) scaled to **`24px`** match Tasks SVGs (`30x30` viewBox with `30px` design) scaled to **`18px`** perfectly.

### C. Icon Intrinsic Size vs. `max-width`/`max-height` Caps
* **The Problem**: Icon containers are often capped with `max-width`/`max-height` (e.g. growing from `16px` to `20px` when a sidebar collapses), on the assumption every icon will scale with that cap. Whether an icon actually does depends on its own intrinsic size — an SVG with `width`/`height` attributes smaller than the cap renders at its own native size and never grows, while an SVG with no `width`/`height` (just a `viewBox`) has no intrinsic size to fall back on and always stretches to fill whatever cap applies. Mixing both kinds of assets in the same slot produces inconsistent, source-dependent scaling that looks like a bug.
* **The Solution**: Before relying on a `max-width`/`max-height` cap to drive a size change, check whether the asset actually has an intrinsic size below both the min and max cap values. If it doesn't, either give it one explicitly, or tune the cap itself (a smaller collapsed-state cap, a scoped class override) so the resulting growth reads as an intentional amount rather than however large the raw asset happens to stretch.
