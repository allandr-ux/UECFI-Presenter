import type { BibleVersion } from '../../shared/types';
import { smartSearchBooks } from './bookSearch';

export type BibleMatchType = 'reference' | 'phrase' | 'exact' | 'fuzzy';

export interface BibleSearchResult {
  id: string;
  bible: BibleVersion;
  bookIdx: number;
  bookName: string;
  chapterNum: number;
  verseNum: number;
  text: string;
  score: number;
  matchType: BibleMatchType;
  highlightTerms: string[];
  aiReason?: string;
}

export interface ParsedScriptureQuery {
  bookPart: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

export interface IndexedVerse {
  key: string;
  bible: BibleVersion;
  bookIdx: number;
  bookName: string;
  chapterNum: number;
  verseNum: number;
  text: string;
  normText: string;
  words: string[];
}

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Reusable scratch buffers to avoid millions of array allocations during fuzzy search
let levPrev = new Uint16Array(64);
let levCurr = new Uint16Array(64);

function boundedLevenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const alen = a.length;
  const blen = b.length;
  if (blen + 1 > levPrev.length) {
    levPrev = new Uint16Array(blen + 16);
    levCurr = new Uint16Array(blen + 16);
  }
  for (let j = 0; j <= blen; j++) levPrev[j] = j;

  for (let i = 1; i <= alen; i++) {
    levCurr[0] = i;
    let rowMin = levCurr[0];
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= blen; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = levPrev[j] + 1;
      const ins = levCurr[j - 1] + 1;
      const sub = levPrev[j - 1] + cost;
      const val = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
      levCurr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = levPrev;
    levPrev = levCurr;
    levCurr = tmp;
  }
  return levPrev[blen];
}

/**
 * Pre-normalizes all verses across loaded Bible XMLs once so keystrokes never
 * re-run NFD normalization or regex splitting over 30k+ verses per Bible.
 */
export function buildBibleSearchIndex(bibles: BibleVersion[]): IndexedVerse[] {
  const index: IndexedVerse[] = [];
  for (const bible of bibles) {
    for (let bookIdx = 0; bookIdx < bible.books.length; bookIdx++) {
      const book = bible.books[bookIdx];
      for (const chap of book.chapters) {
        for (const v of chap.verses) {
          const normText = normalizeText(v.text);
          if (!normText) continue;
          index.push({
            key: `${bible.id}:${bookIdx}:${chap.number}:${v.number}`,
            bible,
            bookIdx,
            bookName: book.name,
            chapterNum: chap.number,
            verseNum: v.number,
            text: v.text,
            normText,
            words: normText.split(' ')
          });
        }
      }
    }
  }
  return index;
}

/**
 * Parses scripture references like:
 * - "John 3:16"
 * - "1 Cor 13:4-7"
 * - "jn 3 16"
 * - "Psalms 23"
 */
export function parseScriptureQuery(raw: string): ParsedScriptureQuery | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^([1-3]?\s*[a-zA-Z\u00C0-\u024F.\s]+?)\s+(\d+)(?:[:.\s]+(\d+)(?:\s*[-–]\s*(\d+))?)?$/
  );
  if (!match) return null;

  const bookPart = match[1].replace(/\./g, '').trim();
  const chapter = Number.parseInt(match[2], 10);
  const verseStart = match[3] ? Number.parseInt(match[3], 10) : undefined;
  const verseEnd = match[4] ? Number.parseInt(match[4], 10) : verseStart;

  if (!bookPart || Number.isNaN(chapter) || chapter <= 0) return null;

  return {
    bookPart,
    chapter,
    verseStart,
    verseEnd: verseEnd && verseStart && verseEnd >= verseStart ? verseEnd : verseStart
  };
}

/**
 * Fast search using a pre-built `IndexedVerse[]` index.
 * Runs exact/prefix matching first and only falls back to fuzzy Levenshtein
 * when literal matches are scarce, keeping typing smooth across large XMLs.
 */
export function searchIndexedBibles(
  index: IndexedVerse[],
  bibles: BibleVersion[],
  rawQuery: string,
  options?: { bibleIdFilter?: string; limit?: number }
): BibleSearchResult[] {
  const query = rawQuery.trim();
  if (!query) return [];

  const limit = options?.limit ?? 100;
  const filterId = options?.bibleIdFilter;
  const targetBibles = filterId ? bibles.filter((b) => b.id === filterId) : bibles;

  const results: BibleSearchResult[] = [];
  const seenKeys = new Set<string>();

  // 1. Direct Scripture Reference Search
  const parsedRef = parseScriptureQuery(query);
  if (parsedRef) {
    for (const bible of targetBibles) {
      const rankedBooks = smartSearchBooks(bible.books, parsedRef.bookPart, bibles);
      const topScore = rankedBooks[0]?.score ?? 0;
      const candidateBooks = rankedBooks
        .filter((rb) => rb.score >= Math.max(300, topScore - 150))
        .slice(0, 2);

      for (const { book, idx: bookIdx, score: bookScore } of candidateBooks) {
        const chap = book.chapters.find((c) => c.number === parsedRef.chapter);
        if (!chap) continue;

        for (const v of chap.verses) {
          const inRange =
            parsedRef.verseStart === undefined ||
            (v.number >= parsedRef.verseStart &&
              v.number <= (parsedRef.verseEnd ?? parsedRef.verseStart));
          if (!inRange) continue;

          const key = `${bible.id}:${bookIdx}:${chap.number}:${v.number}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          results.push({
            id: key,
            bible,
            bookIdx,
            bookName: book.name,
            chapterNum: chap.number,
            verseNum: v.number,
            text: v.text,
            score: 2000 + bookScore,
            matchType: 'reference',
            highlightTerms: []
          });
        }
      }
    }
  }

  // 2. Full-text Search on pre-normalized index
  const qNorm = normalizeText(query);
  const tokens = qNorm.split(' ').filter((tok) => tok.length >= 2);
  if (tokens.length === 0) {
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  const isMultiWord = tokens.length > 1;
  const minTokensRequired = isMultiWord ? Math.ceil(tokens.length * 0.6) : 1;

  // Pass A: Fast literal phrase + exact/prefix token scan
  for (let i = 0; i < index.length; i++) {
    const entry = index[i];
    if (filterId && entry.bible.id !== filterId) continue;
    if (seenKeys.has(entry.key)) continue;

    // Fast substring pre-check before splitting/iterating words
    let anySubstringHit = false;
    for (let t = 0; t < tokens.length; t++) {
      if (entry.normText.includes(tokens[t])) {
        anySubstringHit = true;
        break;
      }
    }
    if (!anySubstringHit) continue;

    if (isMultiWord) {
      const phraseIdx = entry.normText.indexOf(qNorm);
      if (phraseIdx >= 0) {
        seenKeys.add(entry.key);
        results.push({
          id: entry.key,
          bible: entry.bible,
          bookIdx: entry.bookIdx,
          bookName: entry.bookName,
          chapterNum: entry.chapterNum,
          verseNum: entry.verseNum,
          text: entry.text,
          score: 1400 - Math.min(200, phraseIdx),
          matchType: 'phrase',
          highlightTerms: tokens
        });
        continue;
      }
    }

    const words = entry.words;
    let exactCount = 0;
    let prefixCount = 0;
    const matchedPositions: number[] = [];
    const matchedTerms: string[] = [];

    for (const tok of tokens) {
      let foundPos = -1;
      let matchKind: 'exact' | 'prefix' | null = null;

      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const w = words[wIdx];
        if (w === tok) {
          foundPos = wIdx;
          matchKind = 'exact';
          break;
        }
        if (tok.length >= 3 && w.startsWith(tok) && foundPos === -1) {
          foundPos = wIdx;
          matchKind = 'prefix';
        }
      }

      if (matchKind === 'exact') {
        exactCount++;
        matchedPositions.push(foundPos);
        matchedTerms.push(tok);
      } else if (matchKind === 'prefix') {
        prefixCount++;
        matchedPositions.push(foundPos);
        matchedTerms.push(tok);
      }
    }

    const totalMatched = exactCount + prefixCount;
    if (totalMatched < minTokensRequired) continue;

    let proximityBonus = 0;
    if (matchedPositions.length >= 2) {
      const minP = Math.min(...matchedPositions);
      const maxP = Math.max(...matchedPositions);
      proximityBonus = Math.max(0, 120 - (maxP - minP) * 8);
    }

    const allMatchedBonus = totalMatched === tokens.length ? 300 : 0;
    const score =
      exactCount * 220 + prefixCount * 140 + allMatchedBonus + proximityBonus;

    seenKeys.add(entry.key);
    results.push({
      id: entry.key,
      bible: entry.bible,
      bookIdx: entry.bookIdx,
      bookName: entry.bookName,
      chapterNum: entry.chapterNum,
      verseNum: entry.verseNum,
      text: entry.text,
      score,
      matchType: 'exact',
      highlightTerms: Array.from(new Set(matchedTerms))
    });
  }

  // Pass B: Fuzzy Levenshtein fallback ONLY when literal matches are scarce (< 20)
  const hasFuzzyTokens = tokens.some((tok) => tok.length >= 4);
  if (results.length < 20 && hasFuzzyTokens) {
    for (let i = 0; i < index.length; i++) {
      const entry = index[i];
      if (filterId && entry.bible.id !== filterId) continue;
      if (seenKeys.has(entry.key)) continue;

      const words = entry.words;
      let fuzzyCount = 0;
      const matchedTerms: string[] = [];

      for (const tok of tokens) {
        if (tok.length < 4) continue;
        const maxDist = tok.length >= 7 ? 2 : 1;
        let bestDist = maxDist + 1;
        let bestWord = '';

        for (let wIdx = 0; wIdx < words.length; wIdx++) {
          const w = words[wIdx];
          if (w.length < 3) continue;
          // Quick first-letter or length filter for speed
          const d = boundedLevenshtein(tok, w, maxDist);
          if (d < bestDist) {
            bestDist = d;
            bestWord = w;
            if (d === 1) break;
          }
        }

        if (bestDist <= maxDist && bestWord) {
          fuzzyCount++;
          matchedTerms.push(bestWord);
        }
      }

      if (fuzzyCount < minTokensRequired) continue;

      seenKeys.add(entry.key);
      results.push({
        id: entry.key,
        bible: entry.bible,
        bookIdx: entry.bookIdx,
        bookName: entry.bookName,
        chapterNum: entry.chapterNum,
        verseNum: entry.verseNum,
        text: entry.text,
        score: fuzzyCount * 75,
        matchType: 'fuzzy',
        highlightTerms: Array.from(new Set(matchedTerms))
      });

      if (results.length >= limit) break;
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Convenience wrapper that builds the index and searches (kept for callers without a cached index).
 */
export function searchAllBibles(
  bibles: BibleVersion[],
  rawQuery: string,
  options?: { bibleIdFilter?: string; limit?: number }
): BibleSearchResult[] {
  const index = buildBibleSearchIndex(bibles);
  return searchIndexedBibles(index, bibles, rawQuery, options);
}
