import type { BibleBook, BibleVersion } from '../../shared/types';

/**
 * Canonical 66-book aliases (English, common abbreviations, Tagalog/Kapampangan variants)
 * indexed 0..65 so searching in English or local languages finds the right book in any Bible.
 */
const CANONICAL_ALIASES: string[][] = [
  ['genesis', 'gen', 'ge', 'gn'],
  ['exodus', 'exod', 'ex', 'exodo'],
  ['leviticus', 'lev', 'le', 'lv', 'levitico'],
  ['numbers', 'num', 'nu', 'nm', 'bilang', 'numero'],
  ['deuteronomy', 'deut', 'dt', 'deuteronomio'],
  ['joshua', 'josh', 'jos', 'josue'],
  ['judges', 'judg', 'jdg', 'hukom'],
  ['ruth', 'ru', 'rut'],
  ['1 samuel', '1sam', '1sa', '1s'],
  ['2 samuel', '2sam', '2sa', '2s'],
  ['1 kings', '1kgs', '1ki', '1k', '1 hari'],
  ['2 kings', '2kgs', '2ki', '2k', '2 hari'],
  ['1 chronicles', '1chr', '1ch', '1 cronica'],
  ['2 chronicles', '2chr', '2ch', '2 cronica'],
  ['ezra', 'ezr', 'esdras'],
  ['nehemiah', 'neh', 'ne', 'nehemias'],
  ['esther', 'est', 'ester'],
  ['job', 'jb'],
  ['psalms', 'psalm', 'ps', 'psa', 'awit', 'salmo', 'dalit'],
  ['proverbs', 'prov', 'pr', 'kawikaan', 'kasebian'],
  ['ecclesiastes', 'eccl', 'ecc', 'ec', 'mangangaral', 'eclesiastes'],
  ['song of solomon', 'song', 'sos', 'canticle', 'awit ng mga awit'],
  ['isaiah', 'isa', 'is', 'isaias'],
  ['jeremiah', 'jer', 'je', 'jeremias'],
  ['lamentations', 'lam', 'la', 'panaghoy', 'lamentaciones'],
  ['ezekiel', 'ezek', 'eze', 'ezk', 'ezequiel'],
  ['daniel', 'dan', 'da', 'dn'],
  ['hosea', 'hos', 'ho', 'oseas'],
  ['joel', 'jl'],
  ['amos', 'am'],
  ['obadiah', 'obad', 'ob', 'abdias'],
  ['jonah', 'jon', 'jnh', 'jonas'],
  ['micah', 'mic', 'mi', 'miqueas'],
  ['nahum', 'nah', 'na'],
  ['habakkuk', 'hab', 'hb', 'habacuc'],
  ['zephaniah', 'zeph', 'zep', 'sofonia'],
  ['haggai', 'hag', 'hg', 'hageo'],
  ['zechariah', 'zech', 'zec', 'zacarias'],
  ['malachi', 'mal', 'ml', 'malaquias'],
  ['matthew', 'matt', 'mt', 'mateo', 'mateu'],
  ['mark', 'mk', 'mr', 'marcos'],
  ['luke', 'lk', 'lu', 'lucas'],
  ['john', 'jn', 'jhn', 'juan'],
  ['acts', 'ac', 'gawa', 'ding dapat'],
  ['romans', 'rom', 'ro', 'rm', 'roma'],
  ['1 corinthians', '1cor', '1co', '1 corinto'],
  ['2 corinthians', '2cor', '2co', '2 corinto'],
  ['galatians', 'gal', 'ga', 'galacia'],
  ['ephesians', 'eph', 'efeso'],
  ['philippians', 'phil', 'php', 'filipos'],
  ['colossians', 'col', 'colosas'],
  ['1 thessalonians', '1thess', '1th', '1 tesalonica'],
  ['2 thessalonians', '2thess', '2th', '2 tesalonica'],
  ['1 timothy', '1tim', '1ti', '1 timoteo'],
  ['2 timothy', '2tim', '2ti', '2 timoteo'],
  ['titus', 'tit', 'tito'],
  ['philemon', 'phlm', 'phm', 'filemon'],
  ['hebrews', 'heb', 'hebreo'],
  ['james', 'jas', 'jm', 'santiago'],
  ['1 peter', '1pet', '1pe', '1p', '1 pedro'],
  ['2 peter', '2pet', '2pe', '2p', '2 pedro'],
  ['1 john', '1jn', '1jhn', '1jo', '1 juan'],
  ['2 john', '2jn', '2jhn', '2jo', '2 juan'],
  ['3 john', '3jn', '3jhn', '3jo', '3 juan'],
  ['jude', 'jud', 'judas'],
  ['revelation', 'rev', 're', 'apocalypse', 'apocalipsis', 'pahayag', 'kapahayagan']
];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if `needle` is an ordered subsequence of `haystack` (e.g. "jn" in "john").
 */
function subsequenceScore(needle: string, haystack: string): number {
  if (!needle) return 0;
  let nIdx = 0;
  let consecutive = 0;
  let bonus = 0;
  for (let hIdx = 0; hIdx < haystack.length && nIdx < needle.length; hIdx++) {
    if (haystack[hIdx] === needle[nIdx]) {
      consecutive++;
      bonus += consecutive * 2;
      if (hIdx === 0) bonus += 6;
      nIdx++;
    } else {
      consecutive = 0;
    }
  }
  return nIdx === needle.length ? 30 + bonus - (haystack.length - needle.length) * 0.2 : 0;
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function scoreTarget(qNorm: string, qCompact: string, target: string): number {
  const tNorm = normalize(target);
  const tCompact = compact(target);
  if (!tCompact) return 0;

  if (tNorm === qNorm || tCompact === qCompact) return 1000;
  if (tNorm.startsWith(qNorm) || tCompact.startsWith(qCompact)) return 850 - tCompact.length;

  // Word-prefix match (e.g. "cor" matches "1 Corinthians")
  const words = tNorm.split(' ');
  if (words.some((w) => w.startsWith(qNorm))) return 700;

  if (tNorm.includes(qNorm) || tCompact.includes(qCompact)) return 600 - tCompact.indexOf(qCompact) * 2;

  // Subsequence abbreviation match (e.g. "1co", "jn", "gn", "ps", "rev")
  const sub = subsequenceScore(qCompact, tCompact);
  if (sub > 0) return 300 + sub;

  // Typo tolerance via Levenshtein distance
  if (qCompact.length >= 3) {
    const dist = levenshtein(qCompact, tCompact.slice(0, Math.min(tCompact.length, qCompact.length + 2)));
    if (dist <= 2) return 220 - dist * 40;
  }

  return 0;
}

export interface RankedBook {
  book: BibleBook;
  idx: number;
  score: number;
}

/**
 * Ranks Bible books using prefix, word, abbreviation/subsequence, typo tolerance,
 * all loaded XML Bible translations, and canonical multilingual aliases.
 */
export function smartSearchBooks(
  books: BibleBook[],
  query: string,
  allBibles: BibleVersion[] = []
): RankedBook[] {
  const qNorm = normalize(query);
  const qCompact = compact(query);

  if (!qCompact) {
    return books.map((book, idx) => ({ book, idx, score: 1 }));
  }

  const ranked: RankedBook[] = [];
  const hasCanonical66 = books.length === 66;

  books.forEach((book, idx) => {
    let best = scoreTarget(qNorm, qCompact, book.name);

    // Also match against the corresponding book name in every loaded XML Bible
    for (const otherBible of allBibles) {
      const otherBook = otherBible.books[idx];
      if (otherBook) {
        const otherScore = scoreTarget(qNorm, qCompact, otherBook.name);
        if (otherScore > best) {
          best = otherScore - 2; // Slight tie-breaker preference for primary Bible name
        }
      }
    }

    if (hasCanonical66 && CANONICAL_ALIASES[idx]) {
      for (const alias of CANONICAL_ALIASES[idx]) {
        const aliasScore = scoreTarget(qNorm, qCompact, alias);
        if (aliasScore > best) {
          best = aliasScore - 5; // Slightly prefer direct book-name match on ties
        }
      }
    }

    if (best > 0) {
      ranked.push({ book, idx, score: best });
    }
  });

  ranked.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return ranked;
}
