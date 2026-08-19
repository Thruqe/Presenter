import { Database } from "bun:sqlite";
import type { VerseRecord, BookRecord, ParsedRef } from "./types";

const db = new Database("db/KJV.sqlite", { readonly: true });

/**
 * Query matching books by partial name matching.
 */
const searchBooks = db.query<BookRecord, [string]>(
    `SELECT id, name FROM book WHERE name LIKE ? ORDER BY name LIMIT 10`
);

/**
 * Query matching verse text contents.
 */
const searchVerseText = db.query<VerseRecord, [string]>(
    `SELECT v.id, b.name as book, v.chapter, v.verse, v.text
   FROM verse v JOIN book b ON b.id = v.book_id
   WHERE v.text LIKE ? LIMIT 20`
);

/**
 * Query retrieving a single specific verse by book name, chapter, and verse number.
 */
const getVerseQuery = db.query<VerseRecord, [string, number, number]>(
    `SELECT v.id, b.name as book, v.chapter, v.verse, v.text
   FROM verse v JOIN book b ON b.id = v.book_id
   WHERE b.name = ? COLLATE NOCASE AND v.chapter = ? AND v.verse = ?`
);

/**
 * Query retrieving all verses within a specific book chapter.
 */
const getFullChapterQuery = db.query<VerseRecord, [string, number]>(
    `SELECT v.id, b.name as book, v.chapter, v.verse, v.text
   FROM verse v JOIN book b ON b.id = v.book_id
   WHERE b.name = ? COLLATE NOCASE AND v.chapter = ? ORDER BY v.verse`
);

/**
 * Strips bracket-style formatting symbols and normalizes whitespace in text.
 *
 * @param text Raw text content to clean up
 * @returns Sanitized and whitespace-trimmed string
 */
export function cleanText(text: string): string {
    return text
        .replace(/[\[\]()<>]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

/**
 * Parse input reference search query string (e.g., "John 3:16", "Genesis 1 1", "1 John 3:16", "John 3").
 *
 * @param query Input search string
 * @returns Parsed scripture object or null if input format does not match
 */
export function parseRef(query: string): ParsedRef | null {
    const trimmed = query.trim();

    // Match book, chapter, and verse: e.g. "Genesis 1 1", "Genesis 1:1", "1 John 3 16", "1 John 3:16", "Songs of Solomon 2 4"
    const matchWithVerse = trimmed.match(/^(.*?)\s+(\d+)[\s:]+(\d+)$/);
    if (matchWithVerse) {
        const bookPart = matchWithVerse[1]?.trim();
        const chapterPart = matchWithVerse[2];
        const versePart = matchWithVerse[3];

        if (bookPart && chapterPart && versePart) {
            const parsedChapter = parseInt(chapterPart, 10);
            const parsedVerse = parseInt(versePart, 10);
            if (!isNaN(parsedChapter) && !isNaN(parsedVerse)) {
                return {
                    book: bookPart,
                    chapter: parsedChapter,
                    verse: parsedVerse,
                };
            }
        }
    }

    // Match book and chapter only: e.g. "Genesis 1", "Genesis 1:", "1 John 3", "Songs of Solomon 2"
    const matchChapterOnly = trimmed.match(/^(.*?)\s+(\d+):?$/);
    if (matchChapterOnly) {
        const bookPart = matchChapterOnly[1]?.trim();
        const chapterPart = matchChapterOnly[2];

        if (bookPart && chapterPart) {
            const parsedChapter = parseInt(chapterPart, 10);
            if (!isNaN(parsedChapter)) {
                return {
                    book: bookPart,
                    chapter: parsedChapter,
                    verse: null,
                };
            }
        }
    }

    return null;
}

/**
 * Retrieves full chapter verses for a specific book and chapter.
 *
 * @param book Book name
 * @param chapter Chapter number
 * @returns Array of sanitized verse records
 */
export function getFullChapterVerses(book: string, chapter: number): VerseRecord[] {
    const rows = getFullChapterQuery.all(book, chapter);
    return rows.map((r) => ({ ...r, text: cleanText(r.text) }));
}

/**
 * Search books by leading name prefix.
 *
 * @param query Book name prefix query
 * @returns Array of matching book records
 */
export function findBooks(query: string): BookRecord[] {
    return searchBooks.all(`${query}%`);
}

/**
 * Performs fuzzy search on verse texts where all query words must match in any order.
 *
 * @param query Space-separated terms to search for
 * @returns Array of matching sanitized verse records
 */
export function searchFuzzyVerses(query: string): VerseRecord[] {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
        const rows = searchVerseText.all(`%${query}%`);
        return rows.map((r) => ({ ...r, text: cleanText(r.text) }));
    }

    const conditions = words.map(() => `v.text LIKE ?`).join(" AND ");
    const params = words.map((w) => `%${w}%`);

    const fuzzyQuery = db.query<VerseRecord, string[]>(
        `SELECT v.id, b.name as book, v.chapter, v.verse, v.text
     FROM verse v JOIN book b ON b.id = v.book_id
     WHERE ${conditions} LIMIT 20`
    );

    const rows = fuzzyQuery.all(...params);
    return rows.map((r) => ({ ...r, text: cleanText(r.text) }));
}

/**
 * Retrieves a single verse record by book, chapter, and verse index.
 *
 * @param book Target book name
 * @param chapter Target chapter number
 * @param verse Target verse number
 * @returns Sanitized verse record or null if not found
 */
export function getSingleVerse(book: string, chapter: number, verse: number): VerseRecord | null {
    const row = getVerseQuery.get(book, chapter, verse);
    if (!row) return null;
    return {
        ...row,
        text: cleanText(row.text),
    };
}
