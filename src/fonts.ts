// Import only Latin + Latin-ext subsets to avoid bundling Cyrillic, Greek, and Vietnamese font files
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/inter/latin-700-italic.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-700.css';

import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/latin-800.css';
import '@fontsource/montserrat/latin-400-italic.css';
import '@fontsource/montserrat/latin-700-italic.css';
import '@fontsource/montserrat/latin-ext-400.css';
import '@fontsource/montserrat/latin-ext-700.css';

import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/oswald/latin-ext-400.css';
import '@fontsource/oswald/latin-ext-700.css';

import '@fontsource/merriweather/latin-400.css';
import '@fontsource/merriweather/latin-700.css';
import '@fontsource/merriweather/latin-400-italic.css';
import '@fontsource/merriweather/latin-700-italic.css';
import '@fontsource/merriweather/latin-ext-400.css';
import '@fontsource/merriweather/latin-ext-700.css';

import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-700-italic.css';
import '@fontsource/playfair-display/latin-ext-400.css';
import '@fontsource/playfair-display/latin-ext-700.css';

export interface FontOption {
  label: string;
  value: string;
}

export const LOCAL_FONTS: FontOption[] = [
  { label: 'Inter (Modern Sans)', value: "'Inter', sans-serif" },
  { label: 'Montserrat (Bold Display)', value: "'Montserrat', sans-serif" },
  { label: 'Oswald (Condensed)', value: "'Oswald', sans-serif" },
  { label: 'Merriweather (Scripture Serif)', value: "'Merriweather', serif" },
  { label: 'Playfair Display (Elegant Serif)', value: "'Playfair Display', serif" },
  { label: 'System Sans', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: 'System Serif', value: "Georgia, 'Times New Roman', serif" }
];
