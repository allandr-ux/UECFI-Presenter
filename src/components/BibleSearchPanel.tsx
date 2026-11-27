import React, { startTransition, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Eye,
  EyeOff,
  KeyRound,
  Play,
  Plug,
  Plus,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import type { BibleLayoutMode, BibleVersion, ProgramItem, SlideBlock } from '../../shared/types';
import { loadImportedBibles } from '../utils/bibleStorage';
import { cn } from '../utils/cn';
import {
  buildBibleSearchIndex,
  searchIndexedBibles,
  type BibleSearchResult
} from '../utils/bibleFullSearch';
import {
  AI_PROVIDER_PREF_STORAGE,
  GEMINI_API_KEY_STORAGE,
  GEMINI_MODEL_OPTIONS,
  GEMINI_MODEL_STORAGE,
  GROQ_API_KEY_STORAGE,
  GROQ_MODEL_OPTIONS,
  GROQ_MODEL_STORAGE,
  searchBiblesWithAI,
  testSingleProviderKey,
  type AiProviderPref,
  type GeminiSearchOutcome
} from '../utils/geminiBibleSearch';

interface BibleSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectVerseItem: (item: ProgramItem, startBlockIndex: number) => void;
  onOpenChapterInGrid: (item: ProgramItem) => void;
  onAddVerseToProgram: (item: ProgramItem) => void;
}

const PRIMARY_BIBLE_KEY = 'uecfi_bible_primary_id';
const SECONDARY_BIBLE_KEY = 'uecfi_bible_secondary_id';
const BIBLE_LAYOUT_KEY = 'uecfi_bible_layout';

function highlightText(text: string, terms: string[]): React.ReactNode {
  if (terms.length === 0) return text;
  const escaped = terms
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return text;

  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        className="rounded-[3px] bg-amber-400/25 px-0.5 text-amber-200"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

interface GroupedSearchResult {
  key: string;
  representative: BibleSearchResult;
  primaryEntry: { bible: BibleVersion; bookName: string; text: string } | null;
  secondaryEntry: { bible: BibleVersion; bookName: string; text: string } | null;
  highlightTerms: string[];
  aiReason?: string;
}

function lookupVerseInBible(
  bible: BibleVersion | null,
  bookIdx: number,
  chapterNum: number,
  verseNum: number
): { bible: BibleVersion; bookName: string; text: string } | null {
  if (!bible) return null;
  const book = bible.books[bookIdx];
  if (!book) return null;
  const chap = book.chapters.find((c) => c.number === chapterNum);
  const verse = chap?.verses.find((v) => v.number === verseNum);
  if (!verse) return null;
  return { bible, bookName: book.name, text: verse.text };
}

function groupResultsByVerse(
  rawResults: BibleSearchResult[],
  primaryBible: BibleVersion | null,
  secondaryBible: BibleVersion | null
): GroupedSearchResult[] {
  const map = new Map<string, GroupedSearchResult>();

  for (const res of rawResults) {
    const key = `${res.bookIdx}:${res.chapterNum}:${res.verseNum}`;
    const existing = map.get(key);
    if (existing) {
      if (res.highlightTerms.length > 0) {
        existing.highlightTerms = Array.from(
          new Set([...existing.highlightTerms, ...res.highlightTerms])
        );
      }
      if (!existing.aiReason && res.aiReason) {
        existing.aiReason = res.aiReason;
      }
      continue;
    }

    const primaryEntry =
      lookupVerseInBible(primaryBible, res.bookIdx, res.chapterNum, res.verseNum) ??
      (primaryBible === null || res.bible.id === primaryBible.id
        ? { bible: res.bible, bookName: res.bookName, text: res.text }
        : null);
    const secondaryEntry = lookupVerseInBible(
      secondaryBible,
      res.bookIdx,
      res.chapterNum,
      res.verseNum
    );

    map.set(key, {
      key,
      representative: res,
      primaryEntry: primaryEntry ?? { bible: res.bible, bookName: res.bookName, text: res.text },
      secondaryEntry,
      highlightTerms: [...res.highlightTerms],
      aiReason: res.aiReason
    });
  }

  return Array.from(map.values());
}

const MATCH_BADGE: Record<BibleSearchResult['matchType'], { label: string; className: string }> = {
  reference: { label: 'Reference', className: 'text-blue-400' },
  phrase: { label: 'Exact Phrase', className: 'text-emerald-400' },
  exact: { label: 'Keywords', className: 'text-violet-400' },
  fuzzy: { label: 'Fuzzy Match', className: 'text-amber-400' }
};

export const BibleSearchPanel: React.FC<BibleSearchPanelProps> = ({
  isOpen,
  onClose,
  onProjectVerseItem,
  onOpenChapterInGrid,
  onAddVerseToProgram
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const settingsTitleId = useId();
  const [bibles, setBibles] = useState<BibleVersion[]>([]);
  const [primaryId, setPrimaryId] = useState<string>(
    () => localStorage.getItem(PRIMARY_BIBLE_KEY) ?? ''
  );
  const [secondaryId, setSecondaryId] = useState<string>(
    () => localStorage.getItem(SECONDARY_BIBLE_KEY) ?? ''
  );
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [bibleFilter, setBibleFilter] = useState<string>('all');
  const [geminiKey, setGeminiKey] = useState<string>(
    () => (window.presenterAPI ? '' : localStorage.getItem(GEMINI_API_KEY_STORAGE) ?? '')
  );
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>(
    () => (window.presenterAPI ? '' : localStorage.getItem(GEMINI_API_KEY_STORAGE) ?? '')
  );
  const [groqKey, setGroqKey] = useState<string>(
    () => (window.presenterAPI ? '' : localStorage.getItem(GROQ_API_KEY_STORAGE) ?? '')
  );
  const [groqKeyInput, setGroqKeyInput] = useState<string>(
    () => (window.presenterAPI ? '' : localStorage.getItem(GROQ_API_KEY_STORAGE) ?? '')
  );

  // Load API keys from Electron safeStorage (and migrate any legacy localStorage keys)
  useEffect(() => {
    const api = window.presenterAPI;
    if (!api) return;
    let cancelled = false;
    (async () => {
      const legacyGemini = localStorage.getItem(GEMINI_API_KEY_STORAGE)?.trim() || '';
      const legacyGroq = localStorage.getItem(GROQ_API_KEY_STORAGE)?.trim() || '';

      let storedGemini = (await api.getSecret(GEMINI_API_KEY_STORAGE)) ?? '';
      let storedGroq = (await api.getSecret(GROQ_API_KEY_STORAGE)) ?? '';

      if (!storedGemini && legacyGemini) {
        await api.setSecret(GEMINI_API_KEY_STORAGE, legacyGemini);
        storedGemini = legacyGemini;
      }
      if (!storedGroq && legacyGroq) {
        await api.setSecret(GROQ_API_KEY_STORAGE, legacyGroq);
        storedGroq = legacyGroq;
      }

      if (legacyGemini) localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      if (legacyGroq) localStorage.removeItem(GROQ_API_KEY_STORAGE);

      if (!cancelled) {
        setGeminiKey(storedGemini);
        setGeminiKeyInput(storedGemini);
        setGroqKey(storedGroq);
        setGroqKeyInput(storedGroq);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [primaryProvider, setPrimaryProvider] = useState<AiProviderPref>(() => {
    const saved = localStorage.getItem(AI_PROVIDER_PREF_STORAGE);
    return saved === 'groq' ? 'groq' : 'gemini';
  });
  const [primaryProviderInput, setPrimaryProviderInput] = useState<AiProviderPref>(() => {
    const saved = localStorage.getItem(AI_PROVIDER_PREF_STORAGE);
    return saved === 'groq' ? 'groq' : 'gemini';
  });
  const [groqModel, setGroqModel] = useState<string>(
    () => localStorage.getItem(GROQ_MODEL_STORAGE) ?? GROQ_MODEL_OPTIONS[0].id
  );
  const [groqModelInput, setGroqModelInput] = useState<string>(
    () => localStorage.getItem(GROQ_MODEL_STORAGE) ?? GROQ_MODEL_OPTIONS[0].id
  );
  const [geminiModel, setGeminiModel] = useState<string>(
    () => localStorage.getItem(GEMINI_MODEL_STORAGE) ?? GEMINI_MODEL_OPTIONS[0].id
  );
  const [geminiModelInput, setGeminiModelInput] = useState<string>(
    () => localStorage.getItem(GEMINI_MODEL_STORAGE) ?? GEMINI_MODEL_OPTIONS[0].id
  );
  const [groqCustomMode, setGroqCustomMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(GROQ_MODEL_STORAGE) ?? GROQ_MODEL_OPTIONS[0].id;
    return !GROQ_MODEL_OPTIONS.some((o) => o.id === saved);
  });
  const [geminiCustomMode, setGeminiCustomMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(GEMINI_MODEL_STORAGE) ?? GEMINI_MODEL_OPTIONS[0].id;
    return !GEMINI_MODEL_OPTIONS.some((o) => o.id === saved);
  });
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testingGroq, setTestingGroq] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [groqTestStatus, setGroqTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [geminiTestStatus, setGeminiTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const hasAnyAiKey = Boolean(geminiKey.trim() || groqKey.trim());
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOutcome, setAiOutcome] = useState<GeminiSearchOutcome | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadImportedBibles().then((stored) => {
      setBibles(stored);
      const savedPrim = localStorage.getItem(PRIMARY_BIBLE_KEY);
      setPrimaryId(savedPrim && stored.some((b) => b.id === savedPrim) ? savedPrim : stored[0]?.id ?? '');
      const savedSec = localStorage.getItem(SECONDARY_BIBLE_KEY);
      setSecondaryId(savedSec && stored.some((b) => b.id === savedSec) ? savedSec : '');
    });
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setDebouncedQuery(rawQuery);
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [rawQuery]);

  const searchIndex = useMemo(() => buildBibleSearchIndex(bibles), [bibles]);

  const activePrimaryBible = useMemo(() => {
    if (bibleFilter !== 'all') {
      return bibles.find((b) => b.id === bibleFilter) ?? bibles[0] ?? null;
    }
    return bibles.find((b) => b.id === primaryId) ?? bibles[0] ?? null;
  }, [bibles, primaryId, bibleFilter]);

  const activeSecondaryBible = useMemo(() => {
    if (bibleFilter !== 'all') return null;
    if (!secondaryId || secondaryId === activePrimaryBible?.id) return null;
    return bibles.find((b) => b.id === secondaryId) ?? null;
  }, [bibles, secondaryId, activePrimaryBible, bibleFilter]);

  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const raw = searchIndexedBibles(searchIndex, bibles, debouncedQuery, {
      bibleIdFilter: bibleFilter === 'all' ? undefined : bibleFilter,
      limit: 160
    });
    return groupResultsByVerse(raw, activePrimaryBible, activeSecondaryBible).slice(0, 100);
  }, [searchIndex, bibles, debouncedQuery, bibleFilter, activePrimaryBible, activeSecondaryBible]);

  const groupedAiResults = useMemo(() => {
    if (!aiOutcome) return [];
    return groupResultsByVerse(aiOutcome.results, activePrimaryBible, activeSecondaryBible);
  }, [aiOutcome, activePrimaryBible, activeSecondaryBible]);

  const buildChapterItemFromResult = (res: BibleSearchResult): { item: ProgramItem; verseIdx: number } | null => {
    const book = res.bible.books[res.bookIdx];
    const chap = book?.chapters.find((c) => c.number === res.chapterNum);
    if (!book || !chap) return null;

    // Pair with secondary Bible if configured and different from the matched Bible
    const secId = localStorage.getItem(SECONDARY_BIBLE_KEY) ?? '';
    const primId = localStorage.getItem(PRIMARY_BIBLE_KEY) ?? '';
    const savedLayout = localStorage.getItem(BIBLE_LAYOUT_KEY);
    const preferredLayout: BibleLayoutMode =
      savedLayout === 'primary' || savedLayout === 'secondary' || savedLayout === 'stacked'
        ? savedLayout
        : 'stacked';

    const partnerId = res.bible.id === secId ? primId : secId;
    const partnerBible = partnerId && partnerId !== res.bible.id
      ? bibles.find((b) => b.id === partnerId) ?? null
      : null;
    const partnerBook = partnerBible
      ? partnerBible.books.find((b) => b.name.toLowerCase() === book.name.toLowerCase()) ??
        partnerBible.books[res.bookIdx]
      : null;
    const partnerChap = partnerBook?.chapters.find((c) => c.number === chap.number);

    const blocks: SlideBlock[] = chap.verses.map((v) => {
      const secVerse = partnerChap?.verses.find((sv) => sv.number === v.number);
      return {
        id: `${res.bible.id}-${book.name}-${chap.number}-${v.number}`,
        label: `${book.name} ${chap.number}:${v.number} (${res.bible.title})`,
        groupHeader: `${book.name} ${chap.number}`,
        lines: [v.text],
        secondaryLabel:
          secVerse && partnerBible
            ? `${partnerBook?.name ?? book.name} ${chap.number}:${v.number} (${partnerBible.title})`
            : undefined,
        secondaryLines: secVerse ? [secVerse.text] : undefined,
        verseRef: {
          bookIndex: res.bookIdx,
          chapterNum: chap.number,
          verseNum: v.number
        }
      };
    });

    const verseIdx = Math.max(0, chap.verses.findIndex((v) => v.number === res.verseNum));
    return {
      verseIdx,
      item: {
        id: `verse-search-${Date.now()}`,
        title: `${book.name} ${chap.number}`,
        subtitle: partnerBible ? `${res.bible.title} + ${partnerBible.title}` : res.bible.title,
        type: 'verse',
        bibleLayout: partnerBible ? preferredLayout : 'primary',
        followActiveBible: true,
        themeBackground: 'linear-gradient(135deg, #0f172a 0%, #064e3b 100%)',
        blocks
      }
    };
  };

  const handleGoLive = (res: BibleSearchResult) => {
    const built = buildChapterItemFromResult(res);
    if (!built) return;
    onProjectVerseItem(built.item, built.verseIdx);
  };

  const handleOpenChapter = (res: BibleSearchResult) => {
    const built = buildChapterItemFromResult(res);
    if (!built) return;
    onOpenChapterInGrid(built.item);
  };

  const handleAddSingleVerse = (res: BibleSearchResult) => {
    const built = buildChapterItemFromResult(res);
    if (!built) return;
    const block = built.item.blocks[built.verseIdx];
    if (!block) return;

    onAddVerseToProgram({
      ...built.item,
      id: `prog-verse-${Date.now()}`,
      title: `${res.bookName} ${res.chapterNum}:${res.verseNum}`,
      blocks: [block]
    });
  };

  useEffect(() => {
    const dialog = settingsDialogRef.current;
    if (!dialog) return;
    if (keyPanelOpen && !dialog.open) {
      setGroqTestStatus(null);
      setGeminiTestStatus(null);
      dialog.showModal();
    } else if (!keyPanelOpen && dialog.open) {
      dialog.close();
    }
  }, [keyPanelOpen]);

  const handleSaveAiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedGemini = geminiKeyInput.trim();
    const cleanedGroq = groqKeyInput.trim();
    const cleanedGroqModel = groqModelInput.trim() || GROQ_MODEL_OPTIONS[0].id;
    const cleanedGeminiModel = geminiModelInput.trim() || GEMINI_MODEL_OPTIONS[0].id;

    if (window.presenterAPI) {
      await window.presenterAPI.setSecret(GEMINI_API_KEY_STORAGE, cleanedGemini || null);
      await window.presenterAPI.setSecret(GROQ_API_KEY_STORAGE, cleanedGroq || null);
      localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      localStorage.removeItem(GROQ_API_KEY_STORAGE);
    } else {
      if (cleanedGemini) {
        localStorage.setItem(GEMINI_API_KEY_STORAGE, cleanedGemini);
      } else {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      }
      if (cleanedGroq) {
        localStorage.setItem(GROQ_API_KEY_STORAGE, cleanedGroq);
      } else {
        localStorage.removeItem(GROQ_API_KEY_STORAGE);
      }
    }
    localStorage.setItem(AI_PROVIDER_PREF_STORAGE, primaryProviderInput);
    localStorage.setItem(GROQ_MODEL_STORAGE, cleanedGroqModel);
    localStorage.setItem(GEMINI_MODEL_STORAGE, cleanedGeminiModel);

    setGeminiKey(cleanedGemini);
    setGroqKey(cleanedGroq);
    setPrimaryProvider(primaryProviderInput);
    setGroqModel(cleanedGroqModel);
    setGeminiModel(cleanedGeminiModel);
    setKeyPanelOpen(false);
    setAiError(null);
  };

  const handleTestProvider = async (provider: AiProviderPref) => {
    if (provider === 'groq') {
      setTestingGroq(true);
      setGroqTestStatus(null);
      try {
        await testSingleProviderKey('groq', groqKeyInput, groqModelInput);
        setGroqTestStatus({ ok: true, message: 'Groq key verified!' });
      } catch (err) {
        setGroqTestStatus({
          ok: false,
          message: err instanceof Error ? err.message : 'Groq test failed.'
        });
      } finally {
        setTestingGroq(false);
      }
      return;
    }

    setTestingGemini(true);
    setGeminiTestStatus(null);
    try {
      await testSingleProviderKey('gemini', geminiKeyInput, geminiModelInput);
      setGeminiTestStatus({ ok: true, message: 'Gemini key verified!' });
    } catch (err) {
      setGeminiTestStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Gemini test failed.'
      });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleAiSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? rawQuery).trim();
    if (!q) return;
    if (!hasAnyAiKey) {
      setKeyPanelOpen(true);
      setAiError('Please enter and save a Gemini or Groq API key to use AI search.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const outcome = await searchBiblesWithAI(
        geminiKey,
        groqKey,
        q,
        bibles,
        bibleFilter === 'all' ? undefined : bibleFilter,
        {
          primaryProvider,
          geminiModel,
          groqModel
        }
      );
      setAiOutcome(outcome);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI search failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const renderResultCard = (group: GroupedSearchResult) => {
    const res = group.primaryEntry
      ? {
          ...group.representative,
          bible: group.primaryEntry.bible,
          bookName: group.primaryEntry.bookName,
          text: group.primaryEntry.text
        }
      : group.representative;
    const badge = MATCH_BADGE[res.matchType];
    const hasTwoSideBySide = Boolean(group.primaryEntry && group.secondaryEntry);

    return (
      <div
        key={group.key}
        className={cn(
          'flex flex-col gap-2 rounded-[10px] border bg-panel px-3.5 py-3',
          group.aiReason ? 'border-amber-400/35' : 'border-subtle'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[0.86rem] text-blue-300">
              {res.bookName} {res.chapterNum}:{res.verseNum}
            </strong>
            {group.aiReason ? (
              <span className="inline-flex items-center gap-[3px] text-[0.68rem] font-bold text-amber-400">
                <Sparkles size={10} />
                AI
              </span>
            ) : (
              <span className={cn('text-[0.68rem] font-bold', badge.className)}>
                {badge.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleGoLive(res)}
              title="Project verse immediately"
              className="inline-flex items-center gap-1 rounded-md border border-accent bg-blue-500/18 px-[9px] py-1 text-[0.73rem] font-bold text-blue-300 transition-colors hover:bg-blue-500/28"
            >
              <Play size={11} />
              Go Live
            </button>
            <button
              type="button"
              onClick={() => handleOpenChapter(res)}
              title="Open chapter in Content Grid"
              className="inline-flex items-center gap-1 rounded-md border border-subtle bg-panel-elevated px-[9px] py-1 text-[0.73rem] font-semibold text-text-primary transition-colors hover:bg-hover"
            >
              <BookOpen size={11} />
              Chapter
            </button>
            <button
              type="button"
              onClick={() => handleAddSingleVerse(res)}
              title="Add verse to Program"
              className="inline-flex items-center gap-1 rounded-md border border-subtle bg-panel-elevated px-[9px] py-1 text-[0.73rem] font-semibold text-text-primary transition-colors hover:bg-hover"
            >
              <Plus size={11} />
              Program
            </button>
          </div>
        </div>

        {group.aiReason && (
          <div className="text-[0.76rem] italic text-amber-200">
            {group.aiReason}
          </div>
        )}

        <div
          className={cn(
            'grid gap-3',
            hasTwoSideBySide ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {group.primaryEntry && (
            <div
              className={cn(
                'flex flex-col gap-1',
                hasTwoSideBySide && 'border-r border-subtle pr-3'
              )}
            >
              {!group.aiReason && (
                <span className="text-[0.7rem] font-bold text-blue-300">
                  {group.primaryEntry.bible.title}
                </span>
              )}
              <div className="text-[0.85rem] leading-[1.48] text-text-primary">
                {highlightText(group.primaryEntry.text, group.highlightTerms)}
              </div>
            </div>
          )}
          {group.secondaryEntry && (
            <div className="flex flex-col gap-1">
              {!group.aiReason && (
                <span className="text-[0.7rem] font-bold text-green-300">
                  {group.secondaryEntry.bible.title}
                </span>
              )}
              <div className="text-[0.85rem] leading-[1.48] text-text-primary">
                {highlightText(group.secondaryEntry.text, group.highlightTerms)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      {/* Header */}
      <div className="flex items-center justify-between gap-2.5 border-b border-subtle bg-panel px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-400" />
          <span className="text-[0.88rem] font-bold">
            Smart Bible Search
          </span>
          <span className="text-[0.74rem] text-text-muted">
            ({bibles.length} {bibles.length === 1 ? 'XML' : 'XMLs'})
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-[5px] rounded-[7px] border border-subtle bg-panel-elevated px-2.5 py-[5px] text-[0.76rem] font-semibold text-text-primary transition-colors hover:bg-hover"
        >
          <ArrowLeft size={13} />
          Back to Content Grid
        </button>
      </div>

      {/* Search Bar & XML Filter Pills */}
      <div className="flex flex-col gap-2.5 border-b border-subtle bg-panel px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex flex-1 items-center">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 text-text-muted"
            />
            <input
              ref={inputRef}
              type="text"
              value={rawQuery}
              onChange={(e) => {
                setRawQuery(e.target.value);
                setAiError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rawQuery.trim() && !aiLoading) {
                  e.preventDefault();
                  handleAiSearch();
                }
              }}
              placeholder='Search references ("jn 3:16"), keywords, or describe the passage for AI...'
              className="w-full rounded-[10px] border border-accent bg-app py-2.5 pr-9 pl-[38px] text-[0.9rem] text-text-primary focus:outline-none"
            />
            {rawQuery && (
              <button
                type="button"
                onClick={() => {
                  setRawQuery('');
                  setAiOutcome(null);
                  setAiError(null);
                }}
                aria-label="Clear search"
                className="absolute right-2 inline-flex border-0 bg-transparent p-1 text-text-muted hover:text-text-primary"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleAiSearch()}
            disabled={!rawQuery.trim() || aiLoading}
            title="Ask AI to find passages matching a description or story"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-amber-400/55 bg-amber-500/16 px-3.5 py-2.5 text-[0.82rem] font-bold text-amber-200 transition-colors hover:bg-amber-500/24 disabled:opacity-50"
          >
            <Sparkles size={14} />
            {aiLoading ? 'Searching AI...' : 'Ask AI'}
          </button>

          <button
            type="button"
            onClick={() => setKeyPanelOpen((prev) => !prev)}
            aria-label={hasAnyAiKey ? 'AI API keys configured' : 'Set AI API keys'}
            title={hasAnyAiKey ? 'AI Keys Set (click to edit)' : 'Set Gemini / Groq API keys'}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-[10px] border p-2.5 transition-colors',
              hasAnyAiKey
                ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-amber-400/45 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20'
            )}
          >
            <KeyRound size={15} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setBibleFilter('all')}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[0.73rem] font-semibold transition-colors',
              bibleFilter === 'all'
                ? 'border-accent bg-blue-500/20 text-blue-300'
                : 'border-subtle bg-panel-elevated text-text-secondary hover:bg-hover'
            )}
          >
            All Bibles ({bibles.length})
          </button>
          {bibles.map((b) => {
            const active = bibleFilter === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBibleFilter(b.id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[0.73rem] font-semibold transition-colors',
                  active
                    ? 'border-accent bg-blue-500/20 text-blue-300'
                    : 'border-subtle bg-panel-elevated text-text-secondary hover:bg-hover'
                )}
              >
                {b.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Area */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
        {aiError && (
          <div className="rounded-lg border border-red-500/45 bg-red-500/12 px-3 py-2.5 text-[0.8rem] text-red-300">
            {aiError}
          </div>
        )}

        {aiOutcome && (groupedAiResults.length > 0 || aiOutcome.unmatchedSuggestions.length > 0) && (
          <div className="mb-1.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-[5px] text-[0.78rem] font-bold text-amber-400">
                <Sparkles size={13} />
                AI Matches ({groupedAiResults.length}){aiOutcome.provider ? ` · ${aiOutcome.provider}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setAiOutcome(null)}
                className="border-0 bg-transparent text-[0.73rem] text-text-muted hover:text-text-primary"
              >
                Dismiss AI results
              </button>
            </div>
            {groupedAiResults.map(renderResultCard)}
            {aiOutcome.unmatchedSuggestions.map((sugg, idx) => (
              <div
                key={`unmatched-${idx}`}
                className="rounded-lg border border-dashed border-subtle px-3 py-2.5 text-[0.8rem] text-text-secondary"
              >
                <strong className="text-amber-200">
                  {sugg.book} {sugg.chapter}:{sugg.verseStart}
                  {sugg.verseEnd > sugg.verseStart ? `-${sugg.verseEnd}` : ''}
                </strong>{' '}
                — {sugg.reason} <span className="text-text-muted">(not in loaded XMLs)</span>
              </div>
            ))}
          </div>
        )}

        {!debouncedQuery.trim() && !aiOutcome ? (
          <div className="m-auto flex max-w-[540px] flex-col gap-3 text-center text-text-muted">
            <div className="text-[0.92rem] font-semibold text-text-secondary">
              Intelligent Search &amp; AI Lookup
            </div>
            <div className="text-[0.8rem] leading-normal">
              Type a reference or keywords for instant local search, or describe what you are looking for and click <strong className="text-amber-200">Ask AI</strong>.
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {[
                'John 3:16',
                'Psalms 23:1-2',
                'parable of the prodigal son returning home',
                'jesus calming the storm on the boat',
                'do not worry about tomorrow lilies'
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setRawQuery(sample);
                    if (sample.split(' ').length > 3 && hasAnyAiKey) {
                      handleAiSearch(sample);
                    }
                  }}
                  className="rounded-full border border-subtle bg-panel px-[11px] py-[5px] text-[0.76rem] font-semibold text-blue-300 transition-colors hover:bg-hover"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 && !aiOutcome ? (
          <div className="m-auto flex flex-col items-center gap-2.5 text-center">
            <div className="text-[0.88rem] text-text-muted">
              No literal matches found for "{debouncedQuery}" in loaded Bibles.
            </div>
            <button
              type="button"
              onClick={() => handleAiSearch()}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/55 bg-amber-500/16 px-3.5 py-[7px] text-[0.8rem] font-bold text-amber-200 transition-colors hover:bg-amber-500/24 disabled:opacity-50"
            >
              <Sparkles size={14} />
              {aiLoading ? 'Searching with AI...' : 'Find with AI'}
            </button>
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="text-[0.76rem] text-text-muted">
              Showing {results.length} {results.length === 100 ? 'top ' : ''}local result{results.length === 1 ? '' : 's'}
            </div>
            {results.map(renderResultCard)}
          </>
        ) : null}
      </div>

      {/* AI Settings Modal */}
      <dialog
        ref={settingsDialogRef}
        aria-labelledby={settingsTitleId}
        className="w-[min(94vw,720px)] max-w-[720px]"
        onClose={() => {
          if (settingsDialogRef.current) settingsDialogRef.current.returnValue = '';
          setKeyPanelOpen(false);
        }}
      >
        <form onSubmit={handleSaveAiKeys} className="flex flex-col">
          <div className="flex flex-col gap-3.5 px-5 py-[18px]">
            <div className="flex items-center justify-between">
              <h2 id={settingsTitleId} className="m-0 text-base font-bold">
                AI Search Settings
              </h2>
              <button
                type="button"
                onClick={() => setKeyPanelOpen(false)}
                aria-label="Close"
                className="inline-flex rounded-lg border border-subtle bg-transparent p-[5px] transition-colors hover:bg-hover"
              >
                <X size={14} />
              </button>
            </div>

            {/* Primary Provider */}
            <div className="flex flex-col gap-[5px]">
              <label className="text-[0.8rem] font-bold text-text-primary">
                Primary Provider
              </label>
              <select
                value={primaryProviderInput}
                onChange={(e) => setPrimaryProviderInput(e.target.value as AiProviderPref)}
                className="w-full rounded-lg border border-subtle bg-app px-[11px] py-[9px] text-[0.84rem] font-semibold text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="gemini">Gemini (with Groq fallback)</option>
                <option value="groq">Groq (with Gemini fallback)</option>
              </select>
            </div>

            {/* 2-Column Provider Grid */}
            <div className="grid grid-cols-2 items-start gap-3.5">
              {/* Column 1: Groq */}
              <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel p-3">
                <div className="text-[0.82rem] font-bold text-purple-400">
                  Groq
                </div>

                <label className="text-[0.76rem] font-semibold text-text-secondary">
                  API Key
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showGroqKey ? 'text' : 'password'}
                    value={groqKeyInput}
                    onChange={(e) => setGroqKeyInput(e.target.value)}
                    placeholder="gsk_..."
                    className="w-full rounded-lg border border-subtle bg-app py-2 pr-[34px] pl-2.5 text-[0.82rem] text-text-primary focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey((prev) => !prev)}
                    aria-label={showGroqKey ? 'Hide Groq API key' : 'Show Groq API key'}
                    className="absolute right-[7px] inline-flex border-0 bg-transparent p-1 text-text-muted hover:text-text-primary"
                  >
                    {showGroqKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="flex items-center gap-1 text-[0.71rem] text-text-muted">
                  <KeyRound size={11} />
                  <span>
                    Free key:{' '}
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-purple-400 underline"
                    >
                      console.groq.com/keys
                    </a>
                  </span>
                </div>

                <label className="mt-0.5 text-[0.76rem] font-semibold text-text-secondary">
                  Model
                </label>
                <select
                  value={groqCustomMode ? '__custom__' : groqModelInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setGroqCustomMode(true);
                      if (GROQ_MODEL_OPTIONS.some((o) => o.id === groqModelInput)) {
                        setGroqModelInput('');
                      }
                    } else {
                      setGroqCustomMode(false);
                      setGroqModelInput(val);
                    }
                  }}
                  className="w-full rounded-lg border border-subtle bg-app px-2.5 py-2 text-[0.8rem] font-semibold text-text-primary focus:border-accent focus:outline-none"
                >
                  {GROQ_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom model ID...</option>
                </select>
                {groqCustomMode && (
                  <input
                    type="text"
                    value={groqModelInput}
                    onChange={(e) => setGroqModelInput(e.target.value)}
                    placeholder="Custom Groq model ID..."
                    className="w-full rounded-lg border border-accent bg-app px-2.5 py-[7px] text-[0.78rem] text-text-primary focus:outline-none"
                  />
                )}

                <button
                  type="button"
                  onClick={() => handleTestProvider('groq')}
                  disabled={testingGroq}
                  className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-[7px] border border-subtle bg-panel-elevated px-2.5 py-[7px] text-[0.76rem] font-semibold text-text-primary transition-colors hover:bg-hover disabled:opacity-50"
                >
                  <Plug size={12} />
                  {testingGroq ? 'Testing Groq...' : 'Test Groq'}
                </button>

                {groqTestStatus && (
                  <div
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-[0.73rem] font-semibold',
                      groqTestStatus.ok
                        ? 'border-emerald-400/45 bg-emerald-500/12 text-emerald-300'
                        : 'border-red-500/45 bg-red-500/12 text-red-300'
                    )}
                  >
                    {groqTestStatus.message}
                  </div>
                )}
              </div>

              {/* Column 2: Gemini */}
              <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel p-3">
                <div className="text-[0.82rem] font-bold text-blue-300">
                  Gemini
                </div>

                <label className="text-[0.76rem] font-semibold text-text-secondary">
                  API Key
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="AIza..."
                    className="w-full rounded-lg border border-subtle bg-app py-2 pr-[34px] pl-2.5 text-[0.82rem] text-text-primary focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey((prev) => !prev)}
                    aria-label={showGeminiKey ? 'Hide Gemini API key' : 'Show Gemini API key'}
                    className="absolute right-[7px] inline-flex border-0 bg-transparent p-1 text-text-muted hover:text-text-primary"
                  >
                    {showGeminiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="flex items-center gap-1 text-[0.71rem] text-text-muted">
                  <KeyRound size={11} />
                  <span>
                    Free key:{' '}
                    <a
                      href="https://aistudio.google.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-300 underline"
                    >
                      aistudio.google.com/api-keys
                    </a>
                  </span>
                </div>

                <label className="mt-0.5 text-[0.76rem] font-semibold text-text-secondary">
                  Model
                </label>
                <select
                  value={geminiCustomMode ? '__custom__' : geminiModelInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setGeminiCustomMode(true);
                      if (GEMINI_MODEL_OPTIONS.some((o) => o.id === geminiModelInput)) {
                        setGeminiModelInput('');
                      }
                    } else {
                      setGeminiCustomMode(false);
                      setGeminiModelInput(val);
                    }
                  }}
                  className="w-full rounded-lg border border-subtle bg-app px-2.5 py-2 text-[0.8rem] font-semibold text-text-primary focus:border-accent focus:outline-none"
                >
                  {GEMINI_MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom model ID...</option>
                </select>
                {geminiCustomMode && (
                  <input
                    type="text"
                    value={geminiModelInput}
                    onChange={(e) => setGeminiModelInput(e.target.value)}
                    placeholder="Custom Gemini model ID..."
                    className="w-full rounded-lg border border-accent bg-app px-2.5 py-[7px] text-[0.78rem] text-text-primary focus:outline-none"
                  />
                )}

                <button
                  type="button"
                  onClick={() => handleTestProvider('gemini')}
                  disabled={testingGemini}
                  className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-[7px] border border-subtle bg-panel-elevated px-2.5 py-[7px] text-[0.76rem] font-semibold text-text-primary transition-colors hover:bg-hover disabled:opacity-50"
                >
                  <Plug size={12} />
                  {testingGemini ? 'Testing Gemini...' : 'Test Gemini'}
                </button>

                {geminiTestStatus && (
                  <div
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-[0.73rem] font-semibold',
                      geminiTestStatus.ok
                        ? 'border-emerald-400/45 bg-emerald-500/12 text-emerald-300'
                        : 'border-red-500/45 bg-red-500/12 text-red-300'
                    )}
                  >
                    {geminiTestStatus.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-subtle bg-panel px-5 py-3">
            <button
              type="button"
              onClick={() => setKeyPanelOpen(false)}
              className="rounded-lg border border-transparent bg-transparent px-3 py-2 text-[0.8rem] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg border border-purple-500/70 bg-purple-600 px-4 py-2 text-[0.8rem] font-bold text-white transition-colors hover:bg-purple-500"
            >
              Save Settings
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
