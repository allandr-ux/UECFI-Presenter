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

import '@fontsource/arimo/latin-400.css';
import '@fontsource/arimo/latin-600.css';
import '@fontsource/arimo/latin-700.css';

import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';

import '@fontsource/open-sans/latin-400.css';
import '@fontsource/open-sans/latin-600.css';
import '@fontsource/open-sans/latin-700.css';

import '@fontsource/lato/latin-400.css';
import '@fontsource/lato/latin-700.css';
import '@fontsource/lato/latin-900.css';

import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-800.css';

import '@fontsource/raleway/latin-400.css';
import '@fontsource/raleway/latin-600.css';
import '@fontsource/raleway/latin-700.css';
import '@fontsource/raleway/latin-800.css';
import '@fontsource/raleway/latin-900.css';

import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';

import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';

import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';

import '@fontsource/archivo/latin-500.css';
import '@fontsource/archivo/latin-700.css';
import '@fontsource/archivo/latin-900.css';

import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/abril-fatface/latin-400.css';
import '@fontsource/righteous/latin-400.css';

import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-700.css';

import '@fontsource/lobster/latin-400.css';
import '@fontsource/trocchi/latin-400.css';

import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-600.css';
import '@fontsource/lora/latin-700.css';

import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';

import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-700.css';

import '@fontsource/pt-serif/latin-400.css';
import '@fontsource/pt-serif/latin-700.css';

import '@fontsource/libre-baskerville/latin-400.css';
import '@fontsource/libre-baskerville/latin-700.css';

import '@fontsource/dancing-script/latin-400.css';
import '@fontsource/dancing-script/latin-700.css';

import '@fontsource/pacifico/latin-400.css';

import '@fontsource/caveat/latin-400.css';
import '@fontsource/caveat/latin-700.css';

import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/sacramento/latin-400.css';
import '@fontsource/satisfy/latin-400.css';

import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';

import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';

import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-700.css';

import '@fontsource/concert-one/latin-400.css';

import '@fontsource/cambay/latin-400.css';
import '@fontsource/cambay/latin-700.css';

import '@fontsource/niconne/latin-400.css';

import '@fontsource/bungee-shade/latin-400.css';

import '@fontsource/barlow-condensed/latin-600.css';

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'monospace';

export interface FontOption {
  label: string;
  family: string;
  value: string;
  category: FontCategory;
  /** Google Fonts CSS2 family query (omitted for locally bundled or system fonts). */
  googleSpec?: string;
}

export const LOCAL_FONTS: FontOption[] = [
  { label: 'Inter', family: 'Inter', value: "'Inter', sans-serif", category: 'sans' },
  { label: 'Montserrat', family: 'Montserrat', value: "'Montserrat', sans-serif", category: 'sans' },
  { label: 'Oswald', family: 'Oswald', value: "'Oswald', sans-serif", category: 'display' },
  { label: 'Merriweather', family: 'Merriweather', value: "'Merriweather', serif", category: 'serif' },
  { label: 'Playfair Display', family: 'Playfair Display', value: "'Playfair Display', serif", category: 'serif' },
  { label: 'Concert One', family: 'Concert One', value: "'Concert One', sans-serif", category: 'display' },
  { label: 'Cambay', family: 'Cambay', value: "'Cambay', sans-serif", category: 'sans' },
  { label: 'Niconne', family: 'Niconne', value: "'Niconne', cursive", category: 'handwriting' },
  { label: 'Bungee Shade', family: 'Bungee Shade', value: "'Bungee Shade', cursive", category: 'display' },
  { label: 'Barlow Condensed', family: 'Barlow Condensed', value: "'Barlow Condensed', Impact, Arial, sans-serif", category: 'sans' },
  { label: 'Verdana', family: 'Verdana', value: 'Verdana, Geneva, sans-serif', category: 'sans' },
  {
    label: 'System Sans',
    family: 'System Sans',
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    category: 'sans'
  },
  {
    label: 'System Serif',
    family: 'System Serif',
    value: "Georgia, 'Times New Roman', serif",
    category: 'serif'
  }
];

export const FONT_CATALOG: FontOption[] = [
  ...LOCAL_FONTS,
  { label: 'Arimo', family: 'Arimo', value: "'Arimo', sans-serif", category: 'sans' },
  { label: 'Roboto', family: 'Roboto', value: "'Roboto', sans-serif", category: 'sans' },
  { label: 'Open Sans', family: 'Open Sans', value: "'Open Sans', sans-serif", category: 'sans' },
  { label: 'Lato', family: 'Lato', value: "'Lato', sans-serif", category: 'sans' },
  { label: 'Poppins', family: 'Poppins', value: "'Poppins', sans-serif", category: 'sans' },
  { label: 'Raleway', family: 'Raleway', value: "'Raleway', sans-serif", category: 'sans' },
  { label: 'Nunito', family: 'Nunito', value: "'Nunito', sans-serif", category: 'sans' },
  { label: 'DM Sans', family: 'DM Sans', value: "'DM Sans', sans-serif", category: 'sans' },
  { label: 'Space Grotesk', family: 'Space Grotesk', value: "'Space Grotesk', sans-serif", category: 'sans' },
  { label: 'Archivo', family: 'Archivo', value: "'Archivo', sans-serif", category: 'sans' },
  { label: 'Archivo Black', family: 'Archivo Black', value: "'Archivo Black', sans-serif", category: 'display' },
  { label: 'Bebas Neue', family: 'Bebas Neue', value: "'Bebas Neue', sans-serif", category: 'display' },
  { label: 'Anton', family: 'Anton', value: "'Anton', sans-serif", category: 'display' },
  { label: 'Abril Fatface', family: 'Abril Fatface', value: "'Abril Fatface', serif", category: 'display' },
  { label: 'Righteous', family: 'Righteous', value: "'Righteous', sans-serif", category: 'display' },
  { label: 'Fredoka', family: 'Fredoka', value: "'Fredoka', sans-serif", category: 'display' },
  { label: 'Lobster', family: 'Lobster', value: "'Lobster', cursive", category: 'display' },
  { label: 'Trocchi', family: 'Trocchi', value: "'Trocchi', serif", category: 'serif' },
  { label: 'Lora', family: 'Lora', value: "'Lora', serif", category: 'serif' },
  { label: 'Cinzel', family: 'Cinzel', value: "'Cinzel', serif", category: 'serif' },
  { label: 'Cormorant Garamond', family: 'Cormorant Garamond', value: "'Cormorant Garamond', serif", category: 'serif' },
  { label: 'PT Serif', family: 'PT Serif', value: "'PT Serif', serif", category: 'serif' },
  { label: 'Libre Baskerville', family: 'Libre Baskerville', value: "'Libre Baskerville', serif", category: 'serif' },
  { label: 'Dancing Script', family: 'Dancing Script', value: "'Dancing Script', cursive", category: 'handwriting' },
  { label: 'Pacifico', family: 'Pacifico', value: "'Pacifico', cursive", category: 'handwriting' },
  { label: 'Caveat', family: 'Caveat', value: "'Caveat', cursive", category: 'handwriting' },
  { label: 'Great Vibes', family: 'Great Vibes', value: "'Great Vibes', cursive", category: 'handwriting' },
  { label: 'Sacramento', family: 'Sacramento', value: "'Sacramento', cursive", category: 'handwriting' },
  { label: 'Satisfy', family: 'Satisfy', value: "'Satisfy', cursive", category: 'handwriting' },
  { label: 'Space Mono', family: 'Space Mono', value: "'Space Mono', monospace", category: 'monospace' },
  { label: 'JetBrains Mono', family: 'JetBrains Mono', value: "'JetBrains Mono', monospace", category: 'monospace' },
  { label: 'Fira Code', family: 'Fira Code', value: "'Fira Code', monospace", category: 'monospace' }
];

export function extractPrimaryFontFamily(fontFamilyValue?: string): string {
  if (!fontFamilyValue) return 'Inter';
  const first = fontFamilyValue.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
  return first || 'Inter';
}
