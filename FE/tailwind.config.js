import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";
import defaultColors from "tailwindcss/colors.js";

// Giao diện dùng nhiều sắc độ "lẻ" (slate-850, emerald-650, rose-955...) mà Tailwind không có,
// nên các class đó không sinh CSS (ví dụ nút bg-slate-850 chữ trắng thành chữ trắng trên nền trắng).
// Nội suy các sắc độ này từ hai sắc độ chuẩn kề nhau; sắc độ > 950 pha thêm màu đen.
const STANDARD_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const EXTRA_SHADES = [55, 105, 150, 205, 250, 305, 350, 355, 450, 455, 505, 550, 650, 655, 705, 750, 755, 850, 955];
const EXTENDED_FAMILIES = ["slate", "red", "rose", "emerald", "amber", "blue", "indigo", "teal"];

function mixHex(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function extraShades(family) {
  const base = defaultColors[family];
  const shades = {};
  for (const shade of EXTRA_SHADES) {
    const lower = [...STANDARD_SHADES].reverse().find((s) => s <= shade);
    const upper = STANDARD_SHADES.find((s) => s > shade);
    shades[shade] = upper
      ? mixHex(base[lower], base[upper], (shade - lower) / (upper - lower))
      : mixHex(base[lower], "#000000", (shade - lower) / 100);
  }
  return shades;
}

const extendedPalette = Object.fromEntries(
  EXTENDED_FAMILIES.map((family) => [family, { ...defaultColors[family], ...extraShades(family) }])
);

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ...extendedPalette,
        "secondary-fixed-dim": "#c8c6c5",
        "primary": "#a90010",
        "on-surface-variant": "#5e3f3c",
        "success-green": "#22C55E",
        "secondary": "#5f5e5e",
        "on-primary-fixed-variant": "#93000d",
        "error-container": "#ffdad6",
        "secondary-container": "#e2dfde",
        "primary-fixed": "#ffdad6",
        "badge-yellow": "#FFB800",
        "surface-container-lowest": "#ffffff",
        "tertiary-fixed": "#d4e3ff",
        "surface-container-high": "#e7e8ea",
        "price-red": "#D70018",
        "outline-variant": "#e8bcb7",
        "inverse-primary": "#ffb4ab",
        "surface-bright": "#f8f9fb",
        "tertiary-container": "#006cc1",
        "primary-fixed-dim": "#ffb4ab",
        "surface": "#f8f9fb",
        "surface-container": "#edeef0",
        "on-secondary-fixed": "#1b1c1c",
        "inverse-on-surface": "#f0f1f3",
        "on-tertiary-fixed-variant": "#004883",
        "on-background": "#191c1e",
        "tertiary": "#005497",
        "on-tertiary": "#ffffff",
        "surface-container-highest": "#e1e2e4",
        "on-secondary-container": "#636262",
        "on-tertiary-fixed": "#001c39",
        "error": "#ba1a1a",
        "secondary-fixed": "#e5e2e1",
        "on-primary-container": "#ffe7e4",
        "on-surface": "#191c1e",
        "on-error": "#ffffff",
        "primary-container": "#d70018",
        "on-primary": "#ffffff",
        "on-secondary-fixed-variant": "#474746",
        "outline": "#936e6a",
        "on-error-container": "#93000a",
        "background": "#f8f9fb",
        "on-primary-fixed": "#410002",
        "surface-dark": "#1A1A1A",
        "surface-container-low": "#f3f4f6",
        "tertiary-fixed-dim": "#a4c9ff",
        "surface-dim": "#d9dadc",
        "on-secondary": "#ffffff",
        "on-tertiary-container": "#e4edff",
        "surface-variant": "#e1e2e4",
        "surface-tint": "#c00014",
        "inverse-surface": "#2e3132",
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
      spacing: { md: "16px", base: "4px", lg: "24px", xl: "40px", xs: "4px", sm: "8px", gutter: "12px", "container-max": "1400px" },
      fontFamily: {
        "sans": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "body-lg": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "price-display": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "label-caps": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-lg-mobile": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-md": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-lg": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "body-sm": ['"Inter"', '"Be Vietnam Pro"', "ui-sans-serif", "system-ui", "sans-serif"],
        "orbitron": ['"Orbitron"', "sans-serif"],
        "syne": ['"Syne"', "sans-serif"],
        "righteous": ['"Righteous"', "cursive"],
      },
      fontSize: {
        "body-lg": ["16px", { lineHeight: "1.5", fontWeight: "500" }],
        "price-display": ["18px", { lineHeight: "1", fontWeight: "800" }],
        "label-caps": ["13px", { lineHeight: "1.2", fontWeight: "750" }],
        "headline-lg-mobile": ["24px", { lineHeight: "1.2", fontWeight: "800" }],
        "headline-md": ["20px", { lineHeight: "1.3", fontWeight: "800" }],
        "headline-lg": ["32px", { lineHeight: "1.2", letterSpacing: "0", fontWeight: "800" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "500" }],
      },
    },
  },
  plugins: [forms, containerQueries],
};
