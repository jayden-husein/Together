# Together UI

All components use the semantic colors, spacing, typography, and radii in `src/tokens.css`. `src/design.css` owns the shared responsive layouts and states. Dark is the default; Account settings selects the light tokens. Native controls retain browser validation, keyboard support, and password-manager integration. Icons are a single outlined SVG family at 1.75px stroke; there are no emoji icons.

| Component | Props / behavior |
| --- | --- |
| Button | Native button props; `variant`: primary, secondary, danger, text; `busy` disables submission and displays a spinner. |
| IconButton | Button props plus required `label` and `icon`. |
| Input, Textarea, Select | Native React control props. Visible labels are required at use sites. |
| DateTimeField | Input props plus `label`; Grand Canyon MST label. |
| SegmentedControl | `options: {value,label}[]`, `value`, `onChange`. |
| Switch | `label`, `checked`, `onChange`; accessible switch state. |
| Chip, FilterChip | `children`, optional `pressed`, `onClick`. |
| StatusPill / StatusBadge | `status`, optional resolution `outcome`; text plus dot. |
| Avatar | `name`; decorative initials. |
| Card | Native section props and children. |
| StatCard | `label`, `value`, `total`, `pressed`, `onClick`; count and share. |
| Callout | `tone`: info, warn, danger, success; children. |
| Tabs | `tabs: string[]`, `selected`, `onChange`; arrow-key navigation. |
| Drawer, Dialog | `title`, `children`, `onClose`; native modal focus containment, Escape, and focus restoration. |
| Toasts | Singleton live region; `toast(message)` displays for four seconds. |
| Tooltip | `label`, `children`; native accessible title enhancement. Never holds essential information alone. |
| Skeleton | Accessible loading state, reduced-motion aware. |
| EmptyState | `title`, `children` hint, optional `icon`. |
| Timeline | Ordered children; use SourceLine for actor/time. |
| MapLegend | Simulation resource key. |
| AccountMenu | `name`, `email`, `role`, `onSignOut`; shared top-right menu. |

SourceLine and formatTime use `Intl`; itinerary times explicitly use America/Phoenix (MST without DST). Every unavailable role keeps its nav tab and receives an amber warning panel. At under 640px nav moves to the safe-area-aware bottom bar; at under 1024px selected case detail uses a panel with a Back link. Lists page at 25 rows where controls exist, and the case queue loads additional pages without changing selection.
