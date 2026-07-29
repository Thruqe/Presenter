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
   WHERE b.name = ? AND v.chapter = ? AND v.verse = ?`
);

/**
 * Query retrieving all verses within a specific book chapter.
 */
const getFullChapterQuery = db.query<VerseRecord, [string, number]>(
    `SELECT v.id, b.name as book, v.chapter, v.verse, v.text
   FROM verse v JOIN book b ON b.id = v.book_id
   WHERE b.name = ? AND v.chapter = ? ORDER BY v.verse`
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
 * Parse input reference search query string (e.g., "John 3:16", "1 John 3:16", "John 3").
 *
 * @param query Input search string
 * @returns Parsed scripture object or null if input format does not match
 */
export function parseRef(query: string): ParsedRef | null {
    const trimmed = query.trim();
    const match = trimmed.match(/^(.*?)\s+(\d+)(?::(\d*))?$/);
    if (!match) return null;

    const bookPart = match[1];
    const chapterPart = match[2];
    const versePart = match[3];

    if (!bookPart || !chapterPart) return null;

    const parsedChapter = parseInt(chapterPart, 10);
    if (isNaN(parsedChapter)) return null;

    let parsedVerse: number | null = null;
    if (versePart && versePart.trim() !== "") {
        const tempVerse = parseInt(versePart, 10);
        if (!isNaN(tempVerse)) {
            parsedVerse = tempVerse;
        }
    }

    return {
        book: bookPart.trim(),
        chapter: parsedChapter,
        verse: parsedVerse,
    };
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
