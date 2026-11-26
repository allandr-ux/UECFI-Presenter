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
        style={{
          background: 'rgba(251, 191, 36, 0.25)',
          color: '#fde68a',
          borderRadius: '3px',
          padding: '0 2px'
        }}
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

const MATCH_BADGE: Record<BibleSearchResult['matchType'], { label: string; color: string }> = {
  reference: { label: 'Reference', color: '#60a5fa' },
  phrase: { label: 'Exact Phrase', color: '#34d399' },
  exact: { label: 'Keywords', color: '#a78bfa' },
  fuzzy: { label: 'Fuzzy Match', color: '#fbbf24' }
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
        style={{
          borderRadius: '10px',
          border: '1px solid',
          borderColor: group.aiReason ? 'rgba(251, 191, 36, 0.35)' : 'var(--border-subtle)',
          background: 'var(--bg-panel)',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.86rem', color: '#93c5fd' }}>
              {res.bookName} {res.chapterNum}:{res.verseNum}
            </strong>
            {group.aiReason ? (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#fbbf24',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <Sparkles size={10} />
                AI
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: badge.color
                }}
              >
                {badge.label}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleGoLive(res)}
              title="Project verse immediately"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 9px',
                borderRadius: '6px',
                border: '1px solid var(--accent)',
                background: 'rgba(59,130,246,0.18)',
                color: '#93c5fd',
                fontSize: '0.73rem',
                fontWeight: 700
              }}
            >
              <Play size={11} />
              Go Live
            </button>
            <button
              type="button"
              onClick={() => handleOpenChapter(res)}
              title="Open chapter in Content Grid"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 9px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel-elevated)',
                color: 'var(--text-primary)',
                fontSize: '0.73rem',
                fontWeight: 600
              }}
            >
              <BookOpen size={11} />
              Chapter
            </button>
            <button
              type="button"
              onClick={() => handleAddSingleVerse(res)}
              title="Add verse to Program"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 9px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel-elevated)',
                color: 'var(--text-primary)',
                fontSize: '0.73rem',
                fontWeight: 600
              }}
            >
              <Plus size={11} />
              Program
            </button>
          </div>
        </div>

        {group.aiReason && (
          <div style={{ fontSize: '0.76rem', color: '#fde68a', fontStyle: 'italic' }}>
            {group.aiReason}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hasTwoSideBySide ? '1fr 1fr' : '1fr',
            gap: '12px'
          }}
        >
          {group.primaryEntry && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                paddingRight: hasTwoSideBySide ? '12px' : 0,
                borderRight: hasTwoSideBySide ? '1px solid var(--border-subtle)' : 'none'
              }}
            >
              {!group.aiReason && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>
                  {group.primaryEntry.bible.title}
                </span>
              )}
              <div style={{ fontSize: '0.85rem', lineHeight: 1.48, color: 'var(--text-primary)' }}>
                {highlightText(group.primaryEntry.text, group.highlightTerms)}
              </div>
            </div>
          )}
          {group.secondaryEntry && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {!group.aiReason && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#86efac' }}>
                  {group.secondaryEntry.bible.title}
                </span>
              )}
              <div style={{ fontSize: '0.85rem', lineHeight: 1.48, color: 'var(--text-primary)' }}>
                {highlightText(group.secondaryEntry.text, group.highlightTerms)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-app)' }}>
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-panel)',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} style={{ color: '#fbbf24' }} />
          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
            Smart Bible Search
          </span>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            ({bibles.length} {bibles.length === 1 ? 'XML' : 'XMLs'})
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            borderRadius: '7px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel-elevated)',
            color: 'var(--text-primary)',
            fontSize: '0.76rem',
            fontWeight: 600
          }}
        >
          <ArrowLeft size={13} />
          Back to Content Grid
        </button>
      </div>

      {/* Search Bar & XML Filter Pills */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--text-muted)',
                pointerEvents: 'none'
              }}
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
              style={{
                width: '100%',
                padding: '10px 36px 10px 38px',
                borderRadius: '10px',
                border: '1px solid var(--accent)',
                background: 'var(--bg-app)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}
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
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  padding: '4px',
                  display: 'inline-flex'
                }}
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
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(251, 191, 36, 0.55)',
              background: 'rgba(245, 158, 11, 0.16)',
              color: '#fde68a',
              fontSize: '0.82rem',
              fontWeight: 700,
              flexShrink: 0,
              opacity: !rawQuery.trim() || aiLoading ? 0.5 : 1
            }}
          >
            <Sparkles size={14} />
            {aiLoading ? 'Searching AI...' : 'Ask AI'}
          </button>

          <button
            type="button"
            onClick={() => setKeyPanelOpen((prev) => !prev)}
            aria-label={hasAnyAiKey ? 'AI API keys configured' : 'Set AI API keys'}
            title={hasAnyAiKey ? 'AI Keys Set (click to edit)' : 'Set Gemini / Groq API keys'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid',
              borderColor: hasAnyAiKey ? 'rgba(52, 211, 153, 0.4)' : 'rgba(251, 191, 36, 0.45)',
              background: hasAnyAiKey ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: hasAnyAiKey ? '#6ee7b7' : '#fcd34d',
              flexShrink: 0
            }}
          >
            <KeyRound size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setBibleFilter('all')}
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              border: '1px solid',
              borderColor: bibleFilter === 'all' ? 'var(--accent)' : 'var(--border-subtle)',
              background: bibleFilter === 'all' ? 'rgba(59,130,246,0.2)' : 'var(--bg-panel-elevated)',
              color: bibleFilter === 'all' ? '#93c5fd' : 'var(--text-secondary)',
              fontSize: '0.73rem',
              fontWeight: 600
            }}
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
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                  background: active ? 'rgba(59,130,246,0.2)' : 'var(--bg-panel-elevated)',
                  color: active ? '#93c5fd' : 'var(--text-secondary)',
                  fontSize: '0.73rem',
                  fontWeight: 600
                }}
              >
                {b.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {aiError && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#fca5a5',
              fontSize: '0.8rem'
            }}
          >
            {aiError}
          </div>
        )}

        {aiOutcome && (groupedAiResults.length > 0 || aiOutcome.unmatchedSuggestions.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Sparkles size={13} />
                AI Matches ({groupedAiResults.length}){aiOutcome.provider ? ` · ${aiOutcome.provider}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setAiOutcome(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.73rem'
                }}
              >
                Dismiss AI results
              </button>
            </div>
            {groupedAiResults.map(renderResultCard)}
            {aiOutcome.unmatchedSuggestions.map((sugg, idx) => (
              <div
                key={`unmatched-${idx}`}
                style={{
                  borderRadius: '8px',
                  border: '1px dashed var(--border-subtle)',
                  padding: '10px 12px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)'
                }}
              >
                <strong style={{ color: '#fde68a' }}>
                  {sugg.book} {sugg.chapter}:{sugg.verseStart}
                  {sugg.verseEnd > sugg.verseStart ? `-${sugg.verseEnd}` : ''}
                </strong>{' '}
                — {sugg.reason} <span style={{ color: 'var(--text-muted)' }}>(not in loaded XMLs)</span>
              </div>
            ))}
          </div>
        )}

        {!debouncedQuery.trim() && !aiOutcome ? (
          <div
            style={{
              margin: 'auto',
              maxWidth: '540px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              color: 'var(--text-muted)'
            }}
          >
            <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Intelligent Search &amp; AI Lookup
            </div>
            <div style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
              Type a reference or keywords for instant local search, or describe what you are looking for and click <strong style={{ color: '#fde68a' }}>Ask AI</strong>.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '4px' }}>
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
                  style={{
                    padding: '5px 11px',
                    borderRadius: '999px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-panel)',
                    color: '#93c5fd',
                    fontSize: '0.76rem',
                    fontWeight: 600
                  }}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 && !aiOutcome ? (
          <div style={{ margin: 'auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No literal matches found for "{debouncedQuery}" in loaded Bibles.
            </div>
            <button
              type="button"
              onClick={() => handleAiSearch()}
              disabled={aiLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(251, 191, 36, 0.55)',
                background: 'rgba(245, 158, 11, 0.16)',
                color: '#fde68a',
                fontSize: '0.8rem',
                fontWeight: 700
              }}
            >
              <Sparkles size={14} />
              {aiLoading ? 'Searching with AI...' : 'Find with AI'}
            </button>
          </div>
        ) : results.length > 0 ? (
          <>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
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
        style={{ maxWidth: '720px', width: 'min(94vw, 720px)' }}
        onClose={() => {
          if (settingsDialogRef.current) settingsDialogRef.current.returnValue = '';
          setKeyPanelOpen(false);
        }}
      >
        <form onSubmit={handleSaveAiKeys} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id={settingsTitleId} style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                AI Search Settings
              </h2>
              <button
                type="button"
                onClick={() => setKeyPanelOpen(false)}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '5px',
                  display: 'inline-flex'
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Primary Provider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Primary Provider
              </label>
              <select
                value={primaryProviderInput}
                onChange={(e) => setPrimaryProviderInput(e.target.value as AiProviderPref)}
                style={{
                  width: '100%',
                  padding: '9px 11px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  fontWeight: 600
                }}
              >
                <option value="gemini">Gemini (with Groq fallback)</option>
                <option value="groq">Groq (with Gemini fallback)</option>
              </select>
            </div>

            {/* 2-Column Provider Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '14px',
                alignItems: 'start'
              }}
            >
              {/* Column 1: Groq */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-panel)'
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c084fc' }}>
                  Groq
                </div>

                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  API Key
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showGroqKey ? 'text' : 'password'}
                    value={groqKeyInput}
                    onChange={(e) => setGroqKeyInput(e.target.value)}
                    placeholder="gsk_..."
                    style={{
                      width: '100%',
                      padding: '8px 34px 8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey((prev) => !prev)}
                    aria-label={showGroqKey ? 'Hide Groq API key' : 'Show Groq API key'}
                    style={{
                      position: 'absolute',
                      right: '7px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      padding: '4px',
                      display: 'inline-flex'
                    }}
                  >
                    {showGroqKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <KeyRound size={11} />
                  <span>
                    Free key:{' '}
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#c084fc', fontWeight: 700, textDecoration: 'underline' }}
                    >
                      console.groq.com/keys
                    </a>
                  </span>
                </div>

                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px' }}>
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
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
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
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--accent)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '0.78rem'
                    }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => handleTestProvider('groq')}
                  disabled={testingGroq}
                  style={{
                    marginTop: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '7px 10px',
                    borderRadius: '7px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-panel-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '0.76rem',
                    fontWeight: 600
                  }}
                >
                  <Plug size={12} />
                  {testingGroq ? 'Testing Groq...' : 'Test Groq'}
                </button>

                {groqTestStatus && (
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      fontSize: '0.73rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: groqTestStatus.ok ? 'rgba(52, 211, 153, 0.45)' : 'rgba(239, 68, 68, 0.45)',
                      background: groqTestStatus.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: groqTestStatus.ok ? '#6ee7b7' : '#fca5a5'
                    }}
                  >
                    {groqTestStatus.message}
                  </div>
                )}
              </div>

              {/* Column 2: Gemini */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-panel)'
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#93c5fd' }}>
                  Gemini
                </div>

                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  API Key
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="AIza..."
                    style={{
                      width: '100%',
                      padding: '8px 34px 8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey((prev) => !prev)}
                    aria-label={showGeminiKey ? 'Hide Gemini API key' : 'Show Gemini API key'}
                    style={{
                      position: 'absolute',
                      right: '7px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      padding: '4px',
                      display: 'inline-flex'
                    }}
                  >
                    {showGeminiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <KeyRound size={11} />
                  <span>
                    Free key:{' '}
                    <a
                      href="https://aistudio.google.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#93c5fd', fontWeight: 700, textDecoration: 'underline' }}
                    >
                      aistudio.google.com/api-keys
                    </a>
                  </span>
                </div>

                <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px' }}>
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
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600
                  }}
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
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--accent)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '0.78rem'
                    }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => handleTestProvider('gemini')}
                  disabled={testingGemini}
                  style={{
                    marginTop: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '7px 10px',
                    borderRadius: '7px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-panel-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '0.76rem',
                    fontWeight: 600
                  }}
                >
                  <Plug size={12} />
                  {testingGemini ? 'Testing Gemini...' : 'Test Gemini'}
                </button>

                {geminiTestStatus && (
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      fontSize: '0.73rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: geminiTestStatus.ok ? 'rgba(52, 211, 153, 0.45)' : 'rgba(239, 68, 68, 0.45)',
                      background: geminiTestStatus.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: geminiTestStatus.ok ? '#6ee7b7' : '#fca5a5'
                    }}
                  >
                    {geminiTestStatus.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px'
            }}
          >
            <button
              type="button"
              onClick={() => setKeyPanelOpen(false)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(168, 85, 247, 0.7)',
                background: '#9333ea',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 700
              }}
            >
              Save Settings
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
