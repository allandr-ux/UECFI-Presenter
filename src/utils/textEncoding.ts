/**
 * Reads a user-selected text or XML file with BOM, XML prolog, and Windows-1252 fallback detection.
 * Prevents garbled accented characters or XML parse failures when importing files exported
 * by Windows tools (e.g. EasySlides, Notepad) in UTF-16 or Windows-1252/ISO-8859-1.
 */
export async function readTextFileWithEncoding(
  file: File,
  options?: { checkXmlProlog?: boolean }
): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 1. Check for Byte Order Marks (UTF-8, UTF-16LE, UTF-16BE)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  // 2. For XML files, inspect the ASCII header for an explicit encoding="..." attribute
  if (options?.checkXmlProlog) {
    const headerSlice = bytes.subarray(0, Math.min(bytes.length, 256));
    const asciiHeader = new TextDecoder('ascii').decode(headerSlice);
    const match = /<\?xml[^>]+encoding=["']([^"']+)["']/i.exec(asciiHeader);
    if (match?.[1]) {
      try {
        return new TextDecoder(match[1].trim()).decode(bytes);
      } catch {
        // Unsupported encoding label — fall through to UTF-8 / Windows-1252 detection
      }
    }
  }

  // 3. Try strict UTF-8 first; if invalid byte sequences are found, fall back to Windows-1252
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
