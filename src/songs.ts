import { Database } from "bun:sqlite";
import type {
    SongRecord,
    SectionRecord,
    LineRecord,
    FullSongRecord,
} from "./types";

const songDb = new Database("db/songs.sqlite", { create: true });

songDb.run(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    display_mode TEXT NOT NULL DEFAULT 'lower'
  )
`);

songDb.run(`
  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  )
`);

songDb.run(`
  CREATE TABLE IF NOT EXISTS lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
  )
`);

/**
 * Pre-compiled query to list all songs sorted by title.
 */
export const listSongs = songDb.query<SongRecord, []>(
    `SELECT id, title, display_mode FROM songs ORDER BY title`
);

/**
 * Pre-compiled query to retrieve a song record by its ID.
 */
export const getSong = songDb.query<SongRecord, [number]>(
    `SELECT id, title, display_mode FROM songs WHERE id = ?`
);

/**
 * Pre-compiled query to fetch sections for a given song ID.
 */
export const getSections = songDb.query<Omit<SectionRecord, "song_id">, [number]>(
    `SELECT id, label, position FROM sections WHERE song_id = ? ORDER BY position`
);

/**
 * Pre-compiled query to fetch lines for a given section ID.
 */
export const getLines = songDb.query<Omit<LineRecord, "section_id">, [number]>(
    `SELECT id, text, position FROM lines WHERE section_id = ? ORDER BY position`
);

/**
 * Pre-compiled query to insert a new song entry.
 */
export const insertSong = songDb.query<{ id: number }, [string, string]>(
    `INSERT INTO songs (title, display_mode) VALUES (?, ?) RETURNING id`
);

/**
 * Pre-compiled query to insert a section entry into a song.
 */
export const insertSection = songDb.query<{ id: number }, [number, string, number]>(
    `INSERT INTO sections (song_id, label, position) VALUES (?, ?, ?) RETURNING id`
);

/**
 * Pre-compiled query to insert a line into a section.
 */
export const insertLine = songDb.query<{ id: number }, [number, string, number]>(
    `INSERT INTO lines (section_id, text, position) VALUES (?, ?, ?) RETURNING id`
);

/**
 * Pre-compiled query to delete a song record by ID.
 */
export const deleteSong = songDb.query<void, [number]>(
    `DELETE FROM songs WHERE id = ?`
);

/**
 * Fetch full song structure including all nested sections and lines.
 *
 * @param id The unique identifier of the song to retrieve
 * @returns Full song record object or null if not found
 */
export function getFullSong(id: number): FullSongRecord | null {
    const song = getSong.get(id);
    if (!song) return null;

    const sectionsData = getSections.all(id);
    const sections = sectionsData.map((sec) => {
        const linesData = getLines.all(sec.id);
        const lines: LineRecord[] = linesData.map((line) => ({
            id: line.id,
            section_id: sec.id,
            text: line.text,
            position: line.position,
        }));

        return {
            id: sec.id,
            label: sec.label,
            position: sec.position,
            lines,
        };
    });

    return {
        id: song.id,
        title: song.title,
        display_mode: song.display_mode,
        sections,
    };
}
