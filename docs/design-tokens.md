# Design Tokens

Source: `branding.png`

## Typography

Fonts: **Montserrat Bold** (headings/titles), **Sometype Mono** (body).
Line-height: `120%` everywhere.

| Token | Font | Size (px) | Letter-spacing |
| --- | --- | --- | --- |
| `title-1` | Montserrat Bold | 274 | -3% |
| `title-2` | Montserrat Bold | 200 | -4% |
| `h1` | Montserrat Bold | 152 | -2% |
| `h2` | Montserrat Bold | 64 | 2% |
| `h3` | Montserrat Bold | 24 | 0% |
| `h4` | Montserrat Bold | 20 | 0% |
| `body-1` | Sometype Mono | 36 | -2% |
| `body-2` | Sometype Mono | 20 | -2% |
| `body-3` | Sometype Mono | 20 | -2% |

## Colors

### Primary

| Token | Hex | Pantone |
| --- | --- | --- |
| `lego` | `#3A39FF` | 2126 C |
| `lego-dark` | `#06063C` | 282 C |
| `chalkboard` | `#F8F9FA` | P 1-1 C |
| `black` | `#000000` | Black C |

### Secondary

| Token | Hex | Pantone |
| --- | --- | --- |
| `slide` | `#FF5B23` | Scarlet Ibis |
| `slide-dark` | `#481B07` | 19-1317 TCX |

### Tertiary

| Token | Hex | Pantone |
| --- | --- | --- |
| `slime` | `#D9E73C` | Summer Sun |
| `slime-dark` | `#363A0A` | 5747 CP |
| `crayon` | `#F2BB06` | Lemon |
| `crayon-dark` | `#493B00` | 7553 CP |
| `bubblegum` | `#F3B9FF` | 243 C |
| `bubblegum-dark` | `#3E064A` | Dark Purple |

## Usage (Tailwind v4)

Tokens wired in `packages/ui/src/styles/globals.css` via `@theme`. Generates utilities automatically.

```tsx
<h1 className="font-display text-title-1 text-lego-dark">Graduation Show</h1>
<p className="font-mono text-body-1 text-ink">Body copy</p>
<button className="bg-slide text-chalkboard">Action</button>
<span className="bg-bubblegum text-bubblegum-dark">Badge</span>
```

Color utilities: `bg-lego`, `text-lego`, `border-lego`, etc. for every palette token.
Font utilities: `font-display` (Montserrat), `font-mono` (Sometype Mono).
Text utilities: `text-title-1`, `text-title-2`, `text-h1..h4`, `text-body-1..3` (include size + line-height + tracking + weight).
