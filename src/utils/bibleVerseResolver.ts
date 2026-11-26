import type { BibleLayoutMode, BibleVersion, ProgramItem } from '../../shared/types';

const PRIMARY_BIBLE_KEY = 'uecfi_bible_primary_id';
const SECONDARY_BIBLE_KEY = 'uecfi_bible_secondary_id';
const BIBLE_LAYOUT_KEY = 'uecfi_bible_layout';

export function notifyBibleSettingsChanged() {
  window.dispatchEvent(new CustomEvent('uecfi:bible-settings-changed'));
}

/**
 * Re-resolves a `verse` ProgramItem against the currently selected Primary/Secondary Bibles
 * when `item.followActiveBible !== false` and blocks carry `verseRef` coordinates.
 * Falls back to the existing embedded block snapshot if no Bibles are imported or a ref is missing.
 */
export function resolveVerseItemWithActiveBibles(
  item: ProgramItem,
  bibles: BibleVersion[]
): ProgramItem {
  if (item.type !== 'verse' || item.followActiveBible === false || bibles.length === 0) {
    return item;
  }

  const hasAnyRef = item.blocks.some((b) => Boolean(b.verseRef));
  if (!hasAnyRef) return item;

  const savedPrimary = localStorage.getItem(PRIMARY_BIBLE_KEY) || '';
  const savedSecondary = localStorage.getItem(SECONDARY_BIBLE_KEY) ?? '';
  const savedLayout = localStorage.getItem(BIBLE_LAYOUT_KEY);
  const layout: BibleLayoutMode =
    savedLayout === 'primary' || savedLayout === 'secondary' || savedLayout === 'stacked'
      ? savedLayout
      : 'stacked';

  const primaryBible =
    (savedPrimary ? bibles.find((b) => b.id === savedPrimary) : undefined) ?? bibles[0];
  if (!primaryBible) return item;

  const secondaryBible =
    savedSecondary && savedSecondary !== primaryBible.id
      ? bibles.find((b) => b.id === savedSecondary) ?? null
      : null;

  let changed = false;
  const nextBlocks = item.blocks.map((block) => {
    const ref = block.verseRef;
    if (!ref) return block;

    const book = primaryBible.books[ref.bookIndex];
    const chap = book?.chapters.find((c) => c.number === ref.chapterNum);
    const verse = chap?.verses.find((v) => v.number === ref.verseNum);
    if (!book || !chap || !verse) return block;

    const secBook = secondaryBible ? secondaryBible.books[ref.bookIndex] : null;
    const secChap = secBook?.chapters.find((c) => c.number === ref.chapterNum);
    const secVerse = secChap?.verses.find((v) => v.number === ref.verseNum);

    const nextLabel = `${book.name} ${chap.number}:${verse.number} (${primaryBible.title})`;
    const nextGroupHeader = `${book.name} ${chap.number}`;
    const nextLines = [verse.text];
    const nextSecLabel =
      secVerse && secondaryBible
        ? `${secBook?.name ?? book.name} ${chap.number}:${verse.number} (${secondaryBible.title})`
        : undefined;
    const nextSecLines = secVerse ? [secVerse.text] : undefined;

    if (
      block.label === nextLabel &&
      block.groupHeader === nextGroupHeader &&
      block.lines[0] === nextLines[0] &&
      block.secondaryLabel === nextSecLabel &&
      block.secondaryLines?.[0] === nextSecLines?.[0]
    ) {
      return block;
    }

    changed = true;
    return {
      ...block,
      label: nextLabel,
      groupHeader: nextGroupHeader,
      lines: nextLines,
      secondaryLabel: nextSecLabel,
      secondaryLines: nextSecLines
    };
  });

  const nextSubtitle = secondaryBible
    ? `${primaryBible.title} + ${secondaryBible.title}`
    : primaryBible.title;
  const nextLayout: BibleLayoutMode = secondaryBible ? layout : 'primary';

  if (
    !changed &&
    item.subtitle === nextSubtitle &&
    item.bibleLayout === nextLayout
  ) {
    return item;
  }

  return {
    ...item,
    subtitle: nextSubtitle,
    bibleLayout: nextLayout,
    blocks: nextBlocks
  };
}
