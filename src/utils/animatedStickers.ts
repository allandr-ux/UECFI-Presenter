/**
 * Curated Serious-Design Animated Vector Stickers (100% Offline, Recolorable SVGs).
 * Uses standard SVG SMIL (<animate> / <animateTransform>) so every sticker animates
 * natively inside <img> tags across Electron, Chromium, Safari, and Android WebView
 * with zero external APIs, zero rate limits, and full `currentColor` recoloring.
 */

export interface AnimatedStickerPreset {
  id: string;
  name: string;
  category: 'worship' | 'accents' | 'pointers';
  aspect?: number; // width / height ratio (defaults to 1)
  svgTemplate: string;
}

export const ANIMATED_STICKERS: AnimatedStickerPreset[] = [
  {
    id: 'twinkling-sparkles',
    name: 'Twinkling Sparkles',
    category: 'accents',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <path d="M60 12 L68 44 L100 52 L68 60 L60 92 L52 60 L20 52 L52 44 Z" fill="currentColor">
        <animate attributeName="opacity" values="0.35;1;0.35" dur="2.2s" repeatCount="indefinite"/>
        <animateTransform attributeName="transform" type="scale" additive="sum" values="0.88;1.06;0.88" dur="2.2s" repeatCount="indefinite" origin="60 52"/>
      </path>
      <path d="M94 18 L97 28 L107 31 L97 34 L94 44 L91 34 L81 31 L91 28 Z" fill="currentColor">
        <animate attributeName="opacity" values="1;0.2;1" dur="1.8s" begin="0.4s" repeatCount="indefinite"/>
      </path>
      <path d="M26 76 L29 86 L39 89 L29 92 L26 102 L23 92 L13 89 L23 86 Z" fill="currentColor">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="0.9s" repeatCount="indefinite"/>
      </path>
    </svg>`
  },
  {
    id: 'radiant-cross',
    name: 'Radiant Cross',
    category: 'worship',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="44" r="24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5">
        <animate attributeName="r" values="18;38;18" dur="3.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.65;0.08;0.65" dur="3.2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="60" cy="44" r="14" fill="currentColor" opacity="0.18">
        <animate attributeName="r" values="14;26;14" dur="3.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.28;0.05;0.28" dur="3.2s" repeatCount="indefinite"/>
      </circle>
      <rect x="54" y="16" width="12" height="88" rx="4" fill="currentColor"/>
      <rect x="30" y="38" width="60" height="12" rx="4" fill="currentColor"/>
    </svg>`
  },
  {
    id: 'radiant-sunburst',
    name: 'Radiant Sunburst',
    category: 'worship',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <g stroke="currentColor" stroke-width="4" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="18s" repeatCount="indefinite"/>
        <line x1="60" y1="10" x2="60" y2="26"/>
        <line x1="60" y1="94" x2="60" y2="110"/>
        <line x1="10" y1="60" x2="26" y2="60"/>
        <line x1="94" y1="60" x2="110" y2="60"/>
        <line x1="24" y1="24" x2="36" y2="36"/>
        <line x1="84" y1="84" x2="96" y2="96"/>
        <line x1="96" y1="24" x2="84" y2="36"/>
        <line x1="36" y1="84" x2="24" y2="96"/>
      </g>
      <circle cx="60" cy="60" r="18" fill="currentColor">
        <animate attributeName="r" values="16;20;16" dur="3s" repeatCount="indefinite"/>
      </circle>
    </svg>`
  },
  {
    id: 'glowing-halo-ring',
    name: 'Glowing Halo Ring',
    category: 'accents',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" stroke-width="3">
        <animate attributeName="r" values="28;48;28" dur="3.4s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.85;0.15;0.85" dur="3.4s" repeatCount="indefinite"/>
      </circle>
      <circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 6">
        <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="14s" repeatCount="indefinite"/>
      </circle>
    </svg>`
  },
  {
    id: 'flowing-sound-waves',
    name: 'Worship Sound Waves',
    category: 'worship',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="currentColor">
      <rect x="20" y="45" width="10" height="30" rx="5">
        <animate attributeName="height" values="24;68;24" dur="1.2s" repeatCount="indefinite"/>
        <animate attributeName="y" values="48;26;48" dur="1.2s" repeatCount="indefinite"/>
      </rect>
      <rect x="38" y="30" width="10" height="60" rx="5">
        <animate attributeName="height" values="64;26;64" dur="1.1s" begin="0.2s" repeatCount="indefinite"/>
        <animate attributeName="y" values="28;47;28" dur="1.1s" begin="0.2s" repeatCount="indefinite"/>
      </rect>
      <rect x="56" y="20" width="10" height="80" rx="5">
        <animate attributeName="height" values="36;86;36" dur="1.35s" begin="0.1s" repeatCount="indefinite"/>
        <animate attributeName="y" values="42;17;42" dur="1.35s" begin="0.1s" repeatCount="indefinite"/>
      </rect>
      <rect x="74" y="32" width="10" height="56" rx="5">
        <animate attributeName="height" values="58;22;58" dur="1.05s" begin="0.35s" repeatCount="indefinite"/>
        <animate attributeName="y" values="31;49;31" dur="1.05s" begin="0.35s" repeatCount="indefinite"/>
      </rect>
      <rect x="92" y="44" width="10" height="32" rx="5">
        <animate attributeName="height" values="26;62;26" dur="1.25s" begin="0.5s" repeatCount="indefinite"/>
        <animate attributeName="y" values="47;29;47" dur="1.25s" begin="0.5s" repeatCount="indefinite"/>
      </rect>
    </svg>`
  },
  {
    id: 'animated-flourish',
    name: 'Animated Underline',
    category: 'accents',
    aspect: 3,
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 60" width="300" height="60">
      <path d="M16 36 Q150 10 284 36" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="280" stroke-dashoffset="280">
        <animate attributeName="stroke-dashoffset" values="280;0;0;280" keyTimes="0;0.35;0.82;1" dur="3.6s" repeatCount="indefinite"/>
      </path>
      <circle cx="150" cy="23" r="4" fill="currentColor">
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.35;0.82;1" dur="3.6s" repeatCount="indefinite"/>
      </circle>
    </svg>`
  },
  {
    id: 'pulsing-live-beacon',
    name: 'Live Beacon Ring',
    category: 'accents',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="60" r="16" fill="currentColor"/>
      <circle cx="60" cy="60" r="16" fill="none" stroke="currentColor" stroke-width="4">
        <animate attributeName="r" values="16;52" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite"/>
      </circle>
      <circle cx="60" cy="60" r="16" fill="none" stroke="currentColor" stroke-width="3">
        <animate attributeName="r" values="16;52" dur="1.8s" begin="0.9s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.9;0" dur="1.8s" begin="0.9s" repeatCount="indefinite"/>
      </circle>
    </svg>`
  },
  {
    id: 'rising-embers',
    name: 'Rising Light Particles',
    category: 'worship',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="currentColor">
      <circle cx="28" cy="105" r="4">
        <animate attributeName="cy" values="110;15" dur="3.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0.9;0" dur="3.2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="60" cy="105" r="5.5">
        <animate attributeName="cy" values="112;10" dur="2.6s" begin="0.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;1;0" dur="2.6s" begin="0.6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="92" cy="105" r="3.5">
        <animate attributeName="cy" values="108;20" dur="3.6s" begin="1.1s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0.85;0" dur="3.6s" begin="1.1s" repeatCount="indefinite"/>
      </circle>
      <circle cx="44" cy="105" r="3">
        <animate attributeName="cy" values="110;22" dur="2.9s" begin="1.7s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0.8;0" dur="2.9s" begin="1.7s" repeatCount="indefinite"/>
      </circle>
      <circle cx="76" cy="105" r="4.5">
        <animate attributeName="cy" values="110;18" dur="3.1s" begin="2.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0.95;0" dur="3.1s" begin="2.2s" repeatCount="indefinite"/>
      </circle>
    </svg>`
  },
  {
    id: 'animated-checkmark',
    name: 'Animated Checkmark',
    category: 'accents',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="6" stroke-dasharray="277" stroke-dashoffset="277">
        <animate attributeName="stroke-dashoffset" values="277;0;0;277" keyTimes="0;0.3;0.85;1" dur="3.2s" repeatCount="indefinite"/>
      </circle>
      <path d="M38 62 L53 77 L84 44" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="80" stroke-dashoffset="80">
        <animate attributeName="stroke-dashoffset" values="80;80;0;0;80" keyTimes="0;0.25;0.48;0.85;1" dur="3.2s" repeatCount="indefinite"/>
      </path>
    </svg>`
  },
  {
    id: 'guided-arrow-right',
    name: 'Guided Arrow Right',
    category: 'pointers',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
        <animateTransform attributeName="transform" type="translate" values="-8 0;10 0;-8 0" dur="1.5s" repeatCount="indefinite"/>
        <line x1="22" y1="60" x2="92" y2="60"/>
        <polyline points="64 34 92 60 64 86"/>
      </g>
    </svg>`
  },
  {
    id: 'guided-arrow-down',
    name: 'Guided Arrow Down',
    category: 'pointers',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
        <animateTransform attributeName="transform" type="translate" values="0 -8;0 10;0 -8" dur="1.5s" repeatCount="indefinite"/>
        <line x1="60" y1="22" x2="60" y2="92"/>
        <polyline points="34 64 60 92 86 64"/>
      </g>
    </svg>`
  },
  {
    id: 'gentle-heartbeat',
    name: 'Gentle Heartbeat',
    category: 'worship',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <path d="M60 98 C60 98 18 72 18 42 C18 26 30 16 44 16 C52 16 57 20 60 26 C63 20 68 16 76 16 C90 16 102 26 102 42 C102 72 60 98 60 98 Z" fill="currentColor">
        <animateTransform attributeName="transform" type="scale" additive="replace" values="1;1.09;1;1.06;1" keyTimes="0;0.14;0.28;0.42;1" dur="1.8s" repeatCount="indefinite" origin="60 56"/>
      </path>
    </svg>`
  },
  {
    id: 'orbiting-accent',
    name: 'Orbiting Ring',
    category: 'accents',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.35"/>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="4s" repeatCount="indefinite"/>
        <circle cx="60" cy="18" r="7" fill="currentColor"/>
      </g>
    </svg>`
  },
  {
    id: 'shimmering-divider',
    name: 'Shimmering Line',
    category: 'accents',
    aspect: 4,
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 40" width="320" height="40">
      <line x1="12" y1="20" x2="308" y2="20" stroke="currentColor" stroke-width="3" opacity="0.3" stroke-linecap="round"/>
      <rect x="0" y="16" width="76" height="8" rx="4" fill="currentColor">
        <animate attributeName="x" values="-76;320" dur="2.4s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2.4s" repeatCount="indefinite"/>
      </rect>
    </svg>`
  },
  {
    id: 'corner-frame-glow',
    name: 'Corner Frame',
    category: 'accents',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
      <animate attributeName="opacity" values="0.45;1;0.45" dur="2.8s" repeatCount="indefinite"/>
      <polyline points="14 38 14 14 38 14"/>
      <polyline points="82 14 106 14 106 38"/>
      <polyline points="106 82 106 106 82 106"/>
      <polyline points="38 106 14 106 14 82"/>
    </svg>`
  },
  {
    id: 'floating-stars',
    name: 'Floating Stars',
    category: 'worship',
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="currentColor">
      <polygon points="36,24 40,34 51,35 43,42 45,53 36,47 27,53 29,42 21,35 32,34">
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" dur="2.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.6s" repeatCount="indefinite"/>
      </polygon>
      <polygon points="82,42 86,52 97,53 89,60 91,71 82,65 73,71 75,60 67,53 78,52">
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" dur="3.1s" begin="0.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0.45;1" dur="3.1s" begin="0.5s" repeatCount="indefinite"/>
      </polygon>
      <polygon points="48,74 51,81 59,82 53,87 55,95 48,91 41,95 43,87 37,82 45,81">
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="2.2s" begin="1s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" begin="1s" repeatCount="indefinite"/>
      </polygon>
    </svg>`
  }
];
