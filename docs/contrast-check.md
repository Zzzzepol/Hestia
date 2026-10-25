# Hestia color contrast

WCAG contrast ratios for each foreground/background pairing used by the app. Normal text and status icons target at least 4.5:1. Values are computed from `mobile/src/theme/colors.ts`.

| Pairing | Light | Dark |
| --- | ---: | ---: |
| Main text / background | 10.67:1 | 10.67:1 |
| Muted text / background | 6.22:1 | 8.95:1 |
| Main text / surface | 12.30:1 | 8.31:1 |
| Muted text / surface | 7.17:1 | 6.97:1 |
| Main text / muted surface | 9.28:1 | 6.32:1 |
| Muted text / muted surface | 5.41:1 | 5.30:1 |
| Danger text or icon / muted surface | 5.65:1 | 5.52:1 |
| Success text or icon / muted surface | 5.49:1 | 5.44:1 |
| Info text or icon / muted surface | 5.80:1 | 5.84:1 |
| Navigation text or icon / navigation surface | 10.67:1 | 13.36:1 |
| Plum content / gold filled accent | 5.01:1 | 5.01:1 |
| Danger text / background | 6.50:1 | 9.32:1 |

Gold on smoked rose is **2.13:1**, so the app does not use that pairing for text, icons, or a lone border. Gold appears as a small filled shape with plum content. Low stock and overdue use separate icons and danger tones, distinct from selected gold.
