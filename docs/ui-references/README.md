# UI references

Visual references for how Droplet components should look and feel. Direction: **minimalist with subtle glassmorphism**. Consult these before designing any new component, and keep new components consistent with the tokens in `src/styles/tokens.css` and the rules in section 11 of `CLAUDE.md`.

These are inspiration, not assets. Do not copy their colours, icons or content. Colour always comes from the Droplet palette.

| File | What to take from it |
|---|---|
| `01-soft-card-dashboard.png` | Large card radii, layered cards (a card inside a card), a soft white-to-grey surface with a thin highlight edge, one strong dark circular primary action, orange used sparingly as the only accent. |
| `02-location-dropdown.png` | A dropdown panel with a large radius and a deep soft shadow. List rows are full-width pills with a hairline border and a leading icon. The focused input gets a coloured outline and a faint glow. |
| `03-profile-menu.png` | A compact account menu. Rows have a leading line icon and a medium-weight label. The hover state is a filled rounded row. A divider separates destructive or session actions from the rest. |
| `04-popup-menu-shortcuts.png` | A menu that grows out of the control that opened it, with a small pointer. Muted labels, the active row in full ink on a soft pill, keyboard hints as small keycaps on the right. |
| `05-pill-toolbars.png` | Pill containers with a pill nested inside. Round icon buttons, a thin vertical divider between groups, a filled round primary action. The base of the intent bar and action bar. |
| `06-tools-menu-composer.png` | The composer pattern: a rounded input with a `+` and a tools button, and a menu that opens beneath it. Rows are icon plus label with a quiet right-aligned note. |
| `07-sidebar-navigation.png` | The app shell. A project switcher card at the top (icon, name, up/down chevrons), a dashed divider, icon plus label nav, the active item on a soft grey fill with a short dark bar, and sub-items hanging off a dashed guide line. The working screen is a slightly smaller rounded white box inset beside the sidebar. |
| `08-toolbars.png` | Compact toolbars. A vertical pill of icon buttons, a horizontal pill with icon buttons, a thin divider and one dark primary button, and a pill with labelled icons. Components should be toolbars like these, with detail (such as a full colour spectrum) opening on demand rather than always showing. |

## Shared traits

- Rounded everywhere: pills for controls, 20 to 32px radii for panels.
- Surfaces are near-white and slightly translucent over a pale background, with a 1px light border and a soft, low-contrast shadow.
- Line icons only (Solar icon set, linear style), around 1.5px stroke, in ink or slate.
- Small amounts of colour. One accent at a time.
- Generous spacing. Labels are short.
- Motion is small and fast: menus fade and rise a few pixels. Respect `prefers-reduced-motion`.
