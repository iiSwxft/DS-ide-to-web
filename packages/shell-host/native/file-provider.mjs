import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  DEFAULT_LOCAL_FILE_READ_CHARS,
  MAX_LOCAL_FILE_READ_CHARS,
  MAX_LOCAL_FILE_WRITE_BYTES,
} from './contracts.mjs';
import { formatBytes } from './logger.mjs';

export function createFileToolHandlers({ logLine }) {
  return [
    { name: 'local_file_stat', handle: createLocalFileStatResult },
    { name: 'local_file_read', handle: createLocalFileReadResult },
    { name: 'local_file_write', handle: args => createLocalFileWriteResult(args, logLine) },
  ];
}

function createLocalFileStatResult(args) {
  const inputPath = typeof args?.path === 'string' ? args.path.trim() : '';
  if (!inputPath) return toolError('path is required and must be a non-empty string.');

  try {
    const resolvedPath = resolveLocalPath(inputPath);
    const stat = safeStat(resolvedPath);
    return {
      content: [{ type: 'text', text: stat ? `Local path exists: ${resolvedPath}` : `Local path does not exist: ${resolvedPath}` }],
      structuredContent: {
        ok: true,
        data: {
          path: resolvedPath,
          exists: Boolean(stat),
          isFile: stat?.isFile() === true,
          isDirectory: stat?.isDirectory() === true,
          sizeBytes: stat?.size ?? 0,
          modifiedAt: stat?.mtimeMs ?? null,
        },
      },
    };
  } catch (error) {
    return toolError(errorMessage(error));
  }
}

function createLocalFileReadResult(args) {
  const inputPath = typeof args?.path === 'string' ? args.path.trim() : '';
  if (!inputPath) return toolError('path is required and must be a non-empty string.');

  const start = typeof args?.start === 'number' && args.start >= 0 ? Math.floor(args.start) : 0;
  const maxChars = typeof args?.max_chars === 'number' && args.max_chars >= 1
    ? Math.min(Math.floor(args.max_chars), MAX_LOCAL_FILE_READ_CHARS)
    : DEFAULT_LOCAL_FILE_READ_CHARS;

  try {
    const resolvedPath = resolveLocalPath(inputPath);
    const stat = safeStat(resolvedPath);
    if (!stat || !stat.isFile()) throw new Error(`Local file is not readable: ${resolvedPath}`);

    const { content, totalChars, charsRead } = readTextFileWindow(resolvedPath, start, maxChars);
    const nextStart = start + charsRead;
    return {
      content: [{ type: 'text', text: `Read ${content.length} characters from ${resolvedPath}` }],
      structuredContent: {
        ok: true,
        data: {
          path: resolvedPath,
          content,
          start,
          nextStart,
          maxChars,
          totalChars,
          truncated: nextStart < totalChars,
        },
      },
    };
  } catch (error) {
    return toolError(errorMessage(error));
  }
}

function createLocalFileWriteResult(args, logLine) {
  const inputPath = typeof args?.path === 'string' ? args.path.trim() : '';
  if (!inputPath) return toolError('path is required and must be a non-empty string.');
  if (typeof args?.content !== 'string') return toolError('content is required and must be a string.');

  try {
    const resolvedPath = resolveLocalPath(inputPath);
    const content = args.content;
    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (contentBytes > MAX_LOCAL_FILE_WRITE_BYTES) {
      logLine(`local_file_write REJECTED path=${resolvedPath} contentBytes=${contentBytes} limit=${MAX_LOCAL_FILE_WRITE_BYTES}`);
      throw new Error(
        `Content exceeds the local file write limit (${formatBytes(contentBytes)} > ${formatBytes(MAX_LOCAL_FILE_WRITE_BYTES)}). Write the file in chunks: send the first section now, then call local_file_write again with append=true for each remaining section.`,
      );
    }

    const append = args?.append === true;
    const createDirectories = args?.create_directories !== false;
    const parentDir = dirname(resolvedPath);
    if (createDirectories) mkdirSync(parentDir, { recursive: true });
    else if (!safeStat(parentDir)?.isDirectory()) throw new Error(`Parent directory does not exist: ${parentDir}`);

    writeFileSync(resolvedPath, content, { encoding: 'utf8', flag: append ? 'a' : 'w' });
    const sizeAfter = safeStat(resolvedPath)?.size ?? null;
    const sizeMatch = sizeAfter === null ? false : (append ? sizeAfter >= contentBytes : sizeAfter === contentBytes);
    logLine(`local_file_write OK path=${resolvedPath} append=${append} bytesWritten=${contentBytes} sizeOnDisk=${sizeAfter} sizeMatch=${sizeMatch}`);

    return {
      content: [{ type: 'text', text: `${append ? 'Appended' : 'Wrote'} ${contentBytes} bytes to ${resolvedPath}` }],
      structuredContent: {
        ok: true,
        data: { path: resolvedPath, append, bytesWritten: contentBytes, sizeBytes: sizeAfter ?? contentBytes },
      },
    };
  } catch (error) {
    logLine(`local_file_write ERROR path=${inputPath} error=${errorMessage(error)}`);
    return toolError(errorMessage(error));
  }
}

export function resolveLocalPath(input) {
  const trimmed = input.trim();
  if (trimmed === '~') return homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return resolve(homedir(), trimmed.slice(2));
  return resolve(trimmed);
}

export function resolveUnderRoot(rootPath, relativePath) {
  const resolved = resolve(rootPath, relativePath);
  const rel = relative(rootPath, resolved);
  if (rel.startsWith('..') || rel === '..' || isAbsolute(rel)) {
    throw new Error(`Path escapes local Skill root: ${relativePath}`);
  }
  return resolved;
}

export function readTextFile(filePath) {
  return readFileSync(filePath, 'utf8');
}

// Read a character window by on-demand byte reads, avoiding loading the whole file into memory (eliminates OOM).
// Returns { content: window string (<= maxChars characters), totalChars: total characters in the file }.
export function readTextFileWindow(filePath, startChar, maxChars) {
  const stat = safeStat(filePath);
  if (!stat || !stat.isFile()) throw new Error(`Local file is not readable: ${filePath}`);
  const totalBytes = stat.size;
  if (totalBytes === 0) return { content: '', totalChars: 0, charsRead: 0 };

  const fd = openSync(filePath, 'r');
  try {
    const chunkSize = 64 * 1024;

    // Locate the starting byte offset (UTF-8 is variable-width; a sequential-continuation cache avoids O(N^2))
    let bytePos = 0;
    let charPos = 0;
    const cached = readWindowPosCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size && startChar >= cached.charPos) {
      bytePos = cached.bytePos;
      charPos = cached.charPos;
    }
    while (bytePos < totalBytes && charPos < startChar) {
      const want = Math.min(chunkSize, totalBytes - bytePos);
      const buf = Buffer.alloc(want);
      const got = readSync(fd, buf, 0, want, bytePos);
      if (got === 0) break;
      const atEof = bytePos + got >= totalBytes;
      // Scan only the got bytes actually read: Buffer.alloc is zero-filled, so on a short read the trailing 0x00 bytes would be miscounted as characters.
      const { bytes: consumed, chars: added } = scanUtf8Chars(buf.subarray(0, got), startChar - charPos, atEof);
      if (consumed === 0) break; // Defense in depth: stop if the byte pointer does not advance, preventing an infinite loop
      charPos += added;
      // Always advance by consumed: using got would skip the rolled-back trailing incomplete sequence and misalign all later windows.
      bytePos += consumed;
      if (charPos >= startChar) break;
    }
    if (charPos < startChar) {
      return { content: '', totalChars: getTotalCharCount(fd, totalBytes, filePath, stat), charsRead: 0 };
    }
    // At the cap, evict only the oldest entry (FIFO), avoiding clearing all hot caches at once and causing frequent full scans.
    if (readWindowPosCache.size >= MAX_WINDOW_POS_CACHE) {
      const oldest = readWindowPosCache.keys().next().value;
      if (oldest !== undefined) readWindowPosCache.delete(oldest);
    }
    readWindowPosCache.set(filePath, { bytePos, charPos, mtimeMs: stat.mtimeMs, size: stat.size });

    // Read window [startChar, startChar + maxChars)
    let remaining = maxChars;
    let charsRead = 0;
    const parts = [];
    while (bytePos < totalBytes && remaining > 0) {
      const want = Math.min(chunkSize, totalBytes - bytePos);
      const buf = Buffer.alloc(want);
      const got = readSync(fd, buf, 0, want, bytePos);
      if (got === 0) break;
      const atEof = bytePos + got >= totalBytes;
      // Same as above: scan only the got bytes actually read, and when not at EOF roll back a trailing incomplete multi-byte sequence.
      const { bytes: consumed, chars: added } = scanUtf8Chars(buf.subarray(0, got), remaining, atEof);
      if (consumed === 0) break; // Defense in depth: stop if the byte pointer does not advance, preventing an infinite loop
      parts.push(buf.subarray(0, consumed));
      remaining -= added;
      charsRead += added;
      bytePos += consumed;
    }
    const text = Buffer.concat(parts).toString('utf8');
    const windowChars = Array.from(text).slice(0, Math.max(0, maxChars));
    const windowContent = windowChars.join('');
    const totalChars = getTotalCharCount(fd, totalBytes, filePath, stat);
    return { content: windowContent, totalChars, charsRead: windowChars.length };
  } finally {
    closeSync(fd);
  }
}

// Scan the buffer and return "the number of bytes taken by the first maxChars characters" and "the actual character count" (may be < maxChars if the buffer is too short).
// Character continuity across buffers is guaranteed by the UTF-8 byte prefix rules: continuation bytes (0x80-0xBF) are not counted as characters.
//
// atEof=true means the end of this buffer is the end of the file: a trailing incomplete sequence is corrupt data and is kept as-is rather than silently dropped.
// When atEof=false, a trailing incomplete multi-byte sequence must be rolled back. Otherwise, when a character's lead byte falls exactly on the last byte of the buffer,
// the inner while loop's i < bytes.length is immediately false and the continuation bytes are not included, so the returned bytes
// contain a lone lead byte that Buffer.concat().toString('utf8') decodes as U+FFFD; at the same time bytePos
// stops in the middle of a character, misaligning the start position of all later windows.
function scanUtf8Chars(bytes, maxChars, atEof = false) {
  let i = 0;
  let chars = 0;
  while (i < bytes.length && chars < maxChars) {
    if ((bytes[i] & 0xC0) !== 0x80) {
      chars++;
      if (chars === maxChars) {
        i++;
        while (i < bytes.length && (bytes[i] & 0xC0) === 0x80) i++;
        break;
      }
    }
    i++;
  }
  if (atEof) return { bytes: i, chars };
  const rollback = incompleteTailBytes(bytes, i);
  return rollback > 0 ? { bytes: i - rollback, chars: chars - 1 } : { bytes: i, chars };
}

// Return the number of bytes taken by the "incomplete multi-byte sequence" at the end of bytes[0, end); returns 0 when the sequence is complete.
// A single UTF-8 character is at most 4 bytes, so look back at most 3 continuation bytes.
function incompleteTailBytes(bytes, end) {
  let k = end - 1;
  let continuation = 0;
  while (k >= 0 && continuation < 3 && (bytes[k] & 0xC0) === 0x80) {
    k--;
    continuation++;
  }
  if (k < 0) return 0;
  const lead = bytes[k];
  const need = lead < 0x80 ? 1 : lead < 0xE0 ? 2 : lead < 0xF0 ? 3 : 4;
  return continuation + 1 < need ? continuation + 1 : 0;
}

// Sequential-continuation locator cache: records (path -> scanned byte/character offset) so auto-continue scans only the new increment per window.
// Cap protection (L1): prevents the Map from growing without bound and leaking memory when the long-lived host process reads many different files.
const MAX_WINDOW_POS_CACHE = 1024;
const readWindowPosCache = new Map();
// Whole-file character count cache (invalidated by mtime+size), avoiding a full-file rescan on every call. Cap protection same as L1.
const MAX_FILE_CHAR_CACHE = 1024;
const fileCharCountCache = new Map();

function getTotalCharCount(fd, totalBytes, path, stat) {
  const cached = fileCharCountCache.get(path);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.count;
  let count = 0;
  let bytePos = 0;
  const chunkSize = 256 * 1024;
  const buf = Buffer.alloc(chunkSize);
  while (bytePos < totalBytes) {
    const want = Math.min(chunkSize, totalBytes - bytePos);
    const got = readSync(fd, buf, 0, want, bytePos);
    if (got === 0) break;
    for (let j = 0; j < got; j++) if ((buf[j] & 0xC0) !== 0x80) count++;
    bytePos += got;
  }
  // At the cap, evict only the oldest entry (FIFO), avoiding clearing all hot caches at once and causing frequent full scans.
  if (fileCharCountCache.size >= MAX_FILE_CHAR_CACHE) {
    const oldest = fileCharCountCache.keys().next().value;
    if (oldest !== undefined) fileCharCountCache.delete(oldest);
  }
  fileCharCountCache.set(path, { count, mtimeMs: stat.mtimeMs, size: stat.size });
  return count;
}

export function safeReadDirectory(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }
}

export function safeStat(path) {
  try {
    return statSync(path);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

function isMissingPathError(error) {
  return error && typeof error === 'object'
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
