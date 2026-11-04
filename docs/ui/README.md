# UI reference

These are the screens from the FastGo mockup sent with the cahier des charges. They are the visual target. Rebuild them as real components; never copy the HTML into the app.

## What is here

| Folder | Content | Use it for |
|---|---|---|
| `screens/` | 152 standalone HTML pages. Open in a browser; links between screens work. | Exact text, structure, spacing, states |
| `screenshots/` | One JPG per screen (desktop at 1080 px wide, phone at 360 px) | Visual comparison. Claude can read these images. |
| `fg.css` | The mockup stylesheet: tokens on `:root`, utility and component classes | Source for tokens and component styles |
| `sources/*.txt` | Compact source of every screen (one block per screen, `=== ID \| title \| chrome \| ...`) | Fastest way to read a screen's content |
| `i18n/mockup-en.json`, `mockup-ar.json` | French string → English / Arabic, as used in the mockup | Starting point for the message catalogs |
| `assets/` | Logos (light and dark backgrounds) | Logo files until the SVG source arrives |
| `index.json` | Screen list: file, title, chrome, group | Finding a screen |

Icons in the sources are written `{i:name}`; the SVG paths are Lucide-style, 24 px grid, stroke 1.75. Use `lucide-react` with the same names where they exist.

## Screens by app

| Prefix | App | Chrome | Lot | Owner |
|---|---|---|---|---|
| `Main`, `W02` to `W10` | Public site | web | L1 | Engineer 1 |
| `W11` to `W17` | Order flow (5 steps, confirmation, out of zone) | cmd | L1 | Engineer 1 |
| `W18` to `W22` | Sign in, sign up, SMS code, password, phone after Google | web | L1 | Engineer 1 |
| `C01` to `C09` | Client space | client | L1 | Engineer 1 |
| `P01` to `P09` | Merchant space (P08 API is L2) | pro | L1 | Engineer 1 |
| `D1` to `D5` | Recipient link, mobile web | mweb | L1 | Engineer 1 |
| `A00` to `A33` | Back-office | admin | L1, some L2 | Engineer 2 |
| `AL01` to `AL22`, `IP03` to `IP06` | Driver app | ml | L1 | Engineer 3 |
| `AC01` to `AC23`, `IP01`, `IP02` | Client Android app | mc | L2 | later |

Variants: `-Sombre` = dark mode (L2), `-EN` / `-AR` / `D1EN` / `D1AR` = language versions showing how English and RTL Arabic should look.

## Mockup tokens (from `fg.css`)

| Token | Value | Role |
|---|---|---|
| `--n` | `#2A303C` | Navy, main text and dark sections |
| `--nd` | `#1B202A` | Navy deep |
| `--n3` | `#3B4352` | Navy 3, lines on dark |
| `--o` | `#F0721E` | Orange, primary action |
| `--oh` | `#D9630F` | Orange hover |
| `--od` | `#A84E0A` | Orange dark, links and text on light (AA) |
| `--ol` | `#FDEFE3` | Orange light background |
| `--b` / `--bd` / `--bl` | `#1C8CC4` / `#0B6596` / `#E3F2FA` | Info |
| `--g` / `--gl` | `#187A36` / `#E4F2E8` | Success |
| `--a` / `--al` | `#8F5500` / `#FBF0DF` | Warning |
| `--r` / `--rl` | `#B80500` / `#FDECEC` | Error |
| `--t2` | `#5A6372` | Secondary text |
| `--ln` | `#D9DDE3` | Lines |
| `--bg` | `#F4F5F7` | Page background |
| Fonts | Poppins (display, 600/700, italic for eyebrows), Inter (UI), JetBrains Mono (codes, tracking numbers), Noto Sans Arabic (Arabic) | |

The dark-mode values are in `fg.css` under `.th-d`.

## Rules when rebuilding a screen

1. Open the screenshot and the HTML of the screen, and its `-AR` or `-EN` variant if one exists.
2. Build it from `packages/ui` components. If a component is missing, add it to `packages/ui` first.
3. Text goes into the message catalogs in fr, ar and en.
4. Example data (Sami, Boutique Yasmine, FG-7K4M-2QXP, amounts) goes into mock fixtures, never into components.
5. Compare your page with the screenshot at 1440 px and 360 px wide, then in Arabic.
