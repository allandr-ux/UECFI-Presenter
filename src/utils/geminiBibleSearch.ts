import type { BibleVersion } from '../../shared/types';
import { smartSearchBooks } from './bookSearch';
import type { BibleSearchResult } from './bibleFullSearch';

export const GEMINI_API_KEY_STORAGE = 'uecfi_gemini_api_key';
export const GROQ_API_KEY_STORAGE = 'uecfi_groq_api_key';
export const GEMINI_MODEL_STORAGE = 'uecfi_gemini_selected_model';
export const GROQ_MODEL_STORAGE = 'uecfi_groq_selected_model';
export const AI_PROVIDER_PREF_STORAGE = 'uecfi_ai_provider_pref';
const GEMINI_CACHED_MODEL_KEY = 'uecfi_gemini_working_model';

export type AiProviderPref = 'gemini' | 'groq';

export interface ProviderModelOption {
  id: string;
  label: string;
}

export const GROQ_MODEL_OPTIONS: ProviderModelOption[] = [
  { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' }
];

export const GEMINI_MODEL_OPTIONS: ProviderModelOption[] = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }
];

export interface GeminiPassageSuggestion {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  reason: string;
}

export interface GeminiSearchOutcome {
  results: BibleSearchResult[];
  unmatchedSuggestions: GeminiPassageSuggestion[];
  provider?: 'Gemini' | 'Groq';
}

const PREFERRED_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash'
];

const PREFERRED_GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b'
];

function extractJsonPassages(rawText: string): GeminiPassageSuggestion[] {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonSlice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(jsonSlice) as { passages?: GeminiPassageSuggestion[] };
  return Array.isArray(parsed.passages) ? parsed.passages : [];
}

function buildBiblePrompt(query: string): string {
  return [
    'You are a Bible search assistant for a church presentation operator.',
    'A speaker described the gist or theme of a Bible passage they are looking for (in English, Tagalog, Kapampangan, or another language).',
    `Speaker's description: "${query}"`,
    'Return the top 6 most relevant Bible passages as JSON matching this schema:',
    '{"passages":[{"book":"English canonical book name e.g. John or 1 Corinthians or Psalms","chapter":3,"verseStart":16,"verseEnd":16,"reason":"1 short sentence explaining why this matches"}]}',
    'Rules: Use standard 66-book English Protestant canonical names (e.g. "Genesis", "Psalms", "Song of Solomon", "1 Corinthians", "Revelation"). Keep verseStart..verseEnd focused (1-4 verses).'
  ].join('\n');
}

function resolveSuggestionsToBibles(
  suggestions: GeminiPassageSuggestion[],
  bibles: BibleVersion[],
  bibleIdFilter?: string
): Omit<GeminiSearchOutcome, 'provider'> {
  const targetBibles = bibleIdFilter
    ? bibles.filter((b) => b.id === bibleIdFilter)
    : bibles;

  const results: BibleSearchResult[] = [];
  const unmatchedSuggestions: GeminiPassageSuggestion[] = [];
  const seenKeys = new Set<string>();

  suggestions.forEach((sugg, suggIdx) => {
    let matchedAnyBible = false;
    const vStart = Math.max(1, Number(sugg.verseStart) || 1);
    const vEnd = Math.max(vStart, Number(sugg.verseEnd) || vStart);
    const chapNum = Math.max(1, Number(sugg.chapter) || 1);

    for (const bible of targetBibles) {
      const rankedBooks = smartSearchBooks(bible.books, sugg.book, bibles);
      const topBook = rankedBooks[0];
      if (!topBook || topBook.score < 200) continue;

      const chap = topBook.book.chapters.find((c) => c.number === chapNum);
      if (!chap) continue;

      const matchedVerses = chap.verses.filter(
        (v) => v.number >= vStart && v.number <= vEnd
      );
      if (matchedVerses.length === 0) continue;

      matchedAnyBible = true;
      for (const v of matchedVerses) {
        const key = `${bible.id}:${topBook.idx}:${chap.number}:${v.number}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        results.push({
          id: `ai-${key}`,
          bible,
          bookIdx: topBook.idx,
          bookName: topBook.book.name,
          chapterNum: chap.number,
          verseNum: v.number,
          text: v.text,
          score: 3000 - suggIdx * 50,
          matchType: 'reference',
          highlightTerms: [],
          aiReason: sugg.reason
        });
      }
    }

    if (!matchedAnyBible) {
      unmatchedSuggestions.push(sugg);
    }
  });

  return { results, unmatchedSuggestions };
}

async function discoverAvailableGeminiModel(apiKey: string): Promise<string | null> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': apiKey }
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };
  const candidates = (data.models ?? []).filter((m) =>
    m.supportedGenerationMethods?.includes('generateContent')
  );
  const preferred =
    candidates.find((m) => /hydrogen|flash/i.test(m.name ?? '')) ?? candidates[0];
  return preferred?.name ? preferred.name.replace(/^models\//, '') : null;
}

async function fetchPassagesFromGemini(
  apiKey: string,
  query: string,
  preferredModel?: string
): Promise<GeminiPassageSuggestion[]> {
  const prompt = buildBiblePrompt(query);

  const callModel = (model: string) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      }
    );

  const cachedModel = localStorage.getItem(GEMINI_CACHED_MODEL_KEY);
  const firstChoice = preferredModel || cachedModel;
  const candidates = firstChoice
    ? [firstChoice, ...PREFERRED_GEMINI_MODELS.filter((m) => m !== firstChoice)]
    : PREFERRED_GEMINI_MODELS;

  let response: Response | null = null;
  let usedModel = '';
  for (const model of candidates) {
    response = await callModel(model);
    usedModel = model;
    if (response.status !== 404) break;
  }

  if (response && response.status === 404) {
    const discovered = await discoverAvailableGeminiModel(apiKey);
    if (discovered) {
      response = await callModel(discovered);
      usedModel = discovered;
    }
  }

  if (!response || !response.ok) {
    if (response?.status === 404 && cachedModel) {
      localStorage.removeItem(GEMINI_CACHED_MODEL_KEY);
    }
    const status = response?.status ?? 500;
    const errText = response ? await response.text().catch(() => '') : '';
    throw new Error(
      status === 400 || status === 403
        ? 'Invalid or unauthorized Gemini API key.'
        : `Gemini API error (${status}): ${errText.slice(0, 140)}`
    );
  }

  if (usedModel) {
    localStorage.setItem(GEMINI_CACHED_MODEL_KEY, usedModel);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return extractJsonPassages(rawText);
}

async function fetchPassagesFromGroq(
  apiKey: string,
  query: string,
  preferredModel?: string
): Promise<GeminiPassageSuggestion[]> {
  const prompt = buildBiblePrompt(query);
  const modelsToTry = preferredModel
    ? [preferredModel, ...PREFERRED_GROQ_MODELS.filter((m) => m !== preferredModel)]
    : PREFERRED_GROQ_MODELS;

  let response: Response | null = null;
  for (const model of modelsToTry) {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (response.status !== 404) break;
  }

  if (!response || !response.ok) {
    const status = response?.status ?? 500;
    const errText = response ? await response.text().catch(() => '') : '';
    throw new Error(
      status === 401 || status === 403
        ? 'Invalid or unauthorized Groq API key.'
        : `Groq API error (${status}): ${errText.slice(0, 140)}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = data.choices?.[0]?.message?.content ?? '';
  return extractJsonPassages(rawText);
}

export interface AiSearchOptions {
  primaryProvider?: AiProviderPref;
  geminiModel?: string;
  groqModel?: string;
}

/**
 * Searches Bible passages using the configured primary provider & model (with automatic fallback).
 */
export async function searchBiblesWithAI(
  geminiKey: string,
  groqKey: string,
  query: string,
  bibles: BibleVersion[],
  bibleIdFilter?: string,
  options?: AiSearchOptions
): Promise<GeminiSearchOutcome> {
  const gKey = geminiKey.trim();
  const qKey = groqKey.trim();
  const trimmedQuery = query.trim();

  if (!gKey && !qKey) {
    throw new Error('Please enter a Gemini or Groq API key first.');
  }
  if (!trimmedQuery) {
    return { results: [], unmatchedSuggestions: [] };
  }

  const preferGroqFirst = (options?.primaryProvider === 'groq' && Boolean(qKey)) || (!gKey && Boolean(qKey));
  const preferredGemini = options?.geminiModel?.trim() || undefined;
  const preferredGroq = options?.groqModel?.trim() || undefined;

  if (preferGroqFirst && qKey) {
    let groqError: Error | null = null;
    try {
      const suggestions = await fetchPassagesFromGroq(qKey, trimmedQuery, preferredGroq);
      return {
        ...resolveSuggestionsToBibles(suggestions, bibles, bibleIdFilter),
        provider: 'Groq'
      };
    } catch (err) {
      groqError = err instanceof Error ? err : new Error('Groq search failed.');
      if (!gKey) throw groqError;
    }

    try {
      const suggestions = await fetchPassagesFromGemini(gKey, trimmedQuery, preferredGemini);
      return {
        ...resolveSuggestionsToBibles(suggestions, bibles, bibleIdFilter),
        provider: 'Gemini'
      };
    } catch (err) {
      const geminiError = err instanceof Error ? err : new Error('Gemini search failed.');
      throw new Error(`${groqError.message} | Fallback failed: ${geminiError.message}`);
    }
  }

  let geminiError: Error | null = null;

  if (gKey) {
    try {
      const suggestions = await fetchPassagesFromGemini(gKey, trimmedQuery, preferredGemini);
      return {
        ...resolveSuggestionsToBibles(suggestions, bibles, bibleIdFilter),
        provider: 'Gemini'
      };
    } catch (err) {
      geminiError = err instanceof Error ? err : new Error('Gemini search failed.');
      if (!qKey) throw geminiError;
    }
  }

  if (qKey) {
    try {
      const suggestions = await fetchPassagesFromGroq(qKey, trimmedQuery, preferredGroq);
      return {
        ...resolveSuggestionsToBibles(suggestions, bibles, bibleIdFilter),
        provider: 'Groq'
      };
    } catch (err) {
      const groqError = err instanceof Error ? err : new Error('Groq search failed.');
      if (geminiError) {
        throw new Error(`${geminiError.message} | Fallback failed: ${groqError.message}`);
      }
      throw groqError;
    }
  }

  throw geminiError ?? new Error('AI search failed.');
}

/**
 * Verifies a single provider's API key and model with a lightweight request.
 */
export async function testSingleProviderKey(
  provider: AiProviderPref,
  apiKey: string,
  model?: string
): Promise<void> {
  const cleaned = apiKey.trim();
  if (!cleaned) {
    throw new Error(`Enter a ${provider === 'groq' ? 'Groq' : 'Gemini'} API key to test.`);
  }
  const cleanedModel = model?.trim() || undefined;
  if (provider === 'groq') {
    await fetchPassagesFromGroq(cleaned, 'John 3:16', cleanedModel);
  } else {
    await fetchPassagesFromGemini(cleaned, 'John 3:16', cleanedModel);
  }
}

/**
 * Verifies the configured API key(s) and selected model with a lightweight request.
 */
export async function testAiKeyConnection(
  geminiKey: string,
  groqKey: string,
  options?: AiSearchOptions
): Promise<'Gemini' | 'Groq'> {
  const gKey = geminiKey.trim();
  const qKey = groqKey.trim();
  if (!gKey && !qKey) {
    throw new Error('Enter a Groq or Gemini API key to test.');
  }
  const preferGroq = (options?.primaryProvider === 'groq' && Boolean(qKey)) || (!gKey && Boolean(qKey));
  if (preferGroq && qKey) {
    await fetchPassagesFromGroq(qKey, 'John 3:16', options?.groqModel?.trim() || undefined);
    return 'Groq';
  }
  await fetchPassagesFromGemini(gKey, 'John 3:16', options?.geminiModel?.trim() || undefined);
  return 'Gemini';
}
