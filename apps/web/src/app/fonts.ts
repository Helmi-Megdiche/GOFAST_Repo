import { Inter, JetBrains_Mono, Noto_Sans_Arabic, Poppins } from "next/font/google";

// Each font exposes a CSS variable that packages/ui/src/styles/base.css reads.
// Under dir="rtl" the UI and display stacks put Noto Sans Arabic first (base.css).

/** Display: headings, numbers. 600/700 plus 800 italic used by the home headline. */
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-poppins",
  display: "swap",
});

/** UI text. Variable font. */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

/** Codes and tracking numbers. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/** Arabic. Not preloaded: French pages never need it, the browser fetches it on first Arabic glyph. */
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
  preload: false,
});

export const fontVariables = [
  poppins.variable,
  inter.variable,
  jetbrainsMono.variable,
  notoSansArabic.variable,
].join(" ");
