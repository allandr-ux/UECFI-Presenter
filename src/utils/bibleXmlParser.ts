import type { BibleBook, BibleChapter, BibleVerse, BibleVersion } from '../../shared/types';

/**
 * Parses an XML Bible string (supports EasySlides <bible>/<b>/<c>/<v> and Zefania <XMLBIBLE>/<BIBLEBOOK>/<CHAPTER>/<VERS>).
 */
export function parseBibleXml(xmlText: string, fallbackName = 'Imported Bible'): BibleVersion {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid XML file. Please select a valid Bible XML file.');
  }

  const root = doc.documentElement;
  const titleEl = root.querySelector(':scope > title') || root.querySelector(':scope > fname');
  const copyrightEl = root.querySelector(':scope > copyright');
  const title =
    titleEl?.textContent?.trim() ||
    root.getAttribute('biblename')?.trim() ||
    fallbackName.replace(/\.xml$/i, '');

  const books: BibleBook[] = [];

  // Format 1: EasySlides / UECFI XML (<b n="Genesis"><c n="1"><v n="1">...</v></c></b>)
  const bNodes = root.querySelectorAll(':scope > b');
  if (bNodes.length > 0) {
    bNodes.forEach((bNode) => {
      const bookName = bNode.getAttribute('n')?.trim() || 'Unknown Book';
      const chapters: BibleChapter[] = [];

      bNode.querySelectorAll(':scope > c').forEach((cNode) => {
        const chapterNum = Number.parseInt(cNode.getAttribute('n') || '1', 10);
        const verses: BibleVerse[] = [];

        cNode.querySelectorAll(':scope > v').forEach((vNode) => {
          const verseNum = Number.parseInt(vNode.getAttribute('n') || '1', 10);
          const text = (vNode.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) {
            verses.push({ number: verseNum, text });
          }
        });

        if (verses.length > 0) {
          chapters.push({ number: chapterNum, verses });
        }
      });

      if (chapters.length > 0) {
        books.push({ name: bookName, chapters });
      }
    });
  } else {
    // Format 2: Zefania XML (<BIBLEBOOK bname="Genesis"><CHAPTER cnumber="1"><VERS vnumber="1">...</VERS></CHAPTER></BIBLEBOOK>)
    const zBooks = root.querySelectorAll('BIBLEBOOK');
    zBooks.forEach((bNode) => {
      const bookName =
        bNode.getAttribute('bname')?.trim() ||
        bNode.getAttribute('bsname')?.trim() ||
        `Book ${bNode.getAttribute('bnumber') || ''}`;
      const chapters: BibleChapter[] = [];

      bNode.querySelectorAll('CHAPTER').forEach((cNode) => {
        const chapterNum = Number.parseInt(cNode.getAttribute('cnumber') || '1', 10);
        const verses: BibleVerse[] = [];

        cNode.querySelectorAll('VERS').forEach((vNode) => {
          const verseNum = Number.parseInt(vNode.getAttribute('vnumber') || '1', 10);
          const text = (vNode.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) {
            verses.push({ number: verseNum, text });
          }
        });

        if (verses.length > 0) {
          chapters.push({ number: chapterNum, verses });
        }
      });

      if (chapters.length > 0) {
        books.push({ name: bookName, chapters });
      }
    });
  }

  if (books.length === 0) {
    throw new Error('No Bible books or verses found in this XML file.');
  }

  return {
    id: `bible-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    copyright: copyrightEl?.textContent?.trim(),
    books
  };
}
