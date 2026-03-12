export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

export function countCharacters(text: string): number {
  return text.length;
}

export function countCharactersNoSpaces(text: string): number {
  return text.replace(/\s/g, '').length;
}

export function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}

export function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
}

export function estimateReadingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 238);
  if (minutes < 1) { return 'less than a minute'; }
  if (minutes === 1) { return '1 minute'; }
  return `${minutes} minutes`;
}

export function estimatePageCount(wordCount: number): number {
  return Math.ceil(wordCount / 250);
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/^===+$/gm, '');
}

export function cleanUpText(text: string): string {
  let cleaned = text;
  // Straight quotes to smart quotes
  cleaned = cleaned.replace(/"([^"]+)"/g, '\u201C$1\u201D');
  cleaned = cleaned.replace(/'([^']+)'/g, '\u2018$1\u2019');
  // Double hyphens to em dashes
  cleaned = cleaned.replace(/--/g, '\u2014');
  // Ellipsis normalization
  cleaned = cleaned.replace(/\.{3}/g, '\u2026');
  // Remove multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  // Remove trailing whitespace
  cleaned = cleaned.replace(/[ \t]+$/gm, '');
  return cleaned;
}

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  readingTime: string;
  pages: number;
}

export function getTextStats(text: string): TextStats {
  const plain = stripMarkdown(text);
  const words = countWords(plain);
  return {
    words,
    characters: countCharacters(plain),
    charactersNoSpaces: countCharactersNoSpaces(plain),
    sentences: countSentences(plain),
    paragraphs: countParagraphs(text),
    readingTime: estimateReadingTime(words),
    pages: estimatePageCount(words),
  };
}
