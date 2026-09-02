export const MAX_STUDY_SETS = 200;
export const MAX_CARDS_PER_SET = 10_000;
export const MAX_TOTAL_STORED_CARDS = 50_000;
export const MAX_SET_TITLE_LENGTH = 255;
export const MAX_SET_DESCRIPTION_LENGTH = 5_000;
export const MAX_CARD_TEXT_LENGTH = 20_000;
export const MAX_ID_LENGTH = 255;
export const MAX_STORED_JSON_CHARS = 25 * 1024 * 1024;
export const MAX_STORED_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_TEXT_CHARS = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_001;
export const MAX_IMPORT_COLUMNS = 256;
export const MAX_IMPORT_CARDS = 10_000;
export const MAX_IMPORT_TOTAL_CHARS = 20 * 1024 * 1024;
export const MAX_IMPORT_ISSUES = 100;
export const MAX_IMPORT_SHEETS = 100;
export const MAX_SEPARATOR_LENGTH = 100;
export const MAX_WRONG_ATTEMPTS = 1_000_000;

const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_COMPRESSION_RATIO = 100;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const STORED_COMPRESSION_METHOD = 0;
const DEFLATE_COMPRESSION_METHOD = 8;

export function preflightDelimitedText(
  text: string,
  delimiter: string,
): string | undefined {
  let rows = 1;
  let columns = 1;
  let rawFieldCharacters = 0;
  let insideQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        index += 1;
        rawFieldCharacters += 2;
        continue;
      }
      insideQuotes = !insideQuotes;
      rawFieldCharacters += 1;
      continue;
    }
    if (!insideQuotes && character === delimiter) {
      columns += 1;
      rawFieldCharacters = 0;
      if (columns > MAX_IMPORT_COLUMNS) {
        return '列数が上限（' + MAX_IMPORT_COLUMNS + '列）を超えています';
      }
      continue;
    }
    const isLineBreak =
      !insideQuotes &&
      (character === '\n' ||
        (character === '\r' && text[index + 1] !== '\n'));
    if (isLineBreak) {
      rows += 1;
      columns = 1;
      rawFieldCharacters = 0;
      if (rows > MAX_IMPORT_ROWS) return '行数が取込上限を超えています';
      continue;
    }
    rawFieldCharacters += 1;
    if (rawFieldCharacters > MAX_CARD_TEXT_LENGTH * 2 + 2) {
      return '1つのセルが文字数上限を大幅に超えています';
    }
  }
  return undefined;
}

export type SpreadsheetArchiveInspection =
  | {
      ok: true;
      entryCount: number;
      uncompressedBytes: number;
    }
  | {
      ok: false;
      reason:
        | "compressed-too-large"
        | "encrypted"
        | "expanded-too-large"
        | "malformed"
        | "not-workbook"
        | "suspicious-compression"
        | "too-many-entries"
        | "unsafe-path"
        | "zip64-unsupported";
    };

function reject(
  reason: Extract<SpreadsheetArchiveInspection, { ok: false }>["reason"],
): SpreadsheetArchiveInspection {
  return { ok: false, reason };
}

function readEntryName(
  bytes: Uint8Array,
  start: number,
  length: number,
): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(start, start + length),
  );
}

export function inspectSpreadsheetArchive(
  buffer: ArrayBuffer,
): SpreadsheetArchiveInspection {
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
    return reject("compressed-too-large");
  }
  if (buffer.byteLength < 22) return reject("malformed");

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const searchStart = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) return reject("malformed");

  const diskNumber = view.getUint16(endOffset + 4, true);
  const directoryDisk = view.getUint16(endOffset + 6, true);
  const diskEntries = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const directorySize = view.getUint32(endOffset + 12, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  const commentLength = view.getUint16(endOffset + 20, true);

  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntries !== entryCount
  ) {
    return reject("malformed");
  }
  if (
    diskEntries === 0xffff ||
    entryCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    return reject("zip64-unsupported");
  }
  if (
    entryCount === 0 ||
    entryCount > MAX_ARCHIVE_ENTRIES ||
    endOffset + 22 + commentLength !== bytes.length
  ) {
    return entryCount > MAX_ARCHIVE_ENTRIES
      ? reject("too-many-entries")
      : reject("malformed");
  }
  if (
    directoryOffset + directorySize > endOffset ||
    directoryOffset + directorySize > bytes.length
  ) {
    return reject("malformed");
  }

  const names = new Set<string>();
  const localRanges: Array<[number, number]> = [];
  let cursor = directoryOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > endOffset ||
      view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return reject("malformed");
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const entryCommentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nextCursor =
      cursor + 46 + nameLength + extraLength + entryCommentLength;

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      return reject("zip64-unsupported");
    }
    if (nextCursor > endOffset) return reject("malformed");
    if (
      localHeaderOffset + 30 > directoryOffset ||
      view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE
    ) {
      return reject("malformed");
    }
    if (
      compressionMethod !== STORED_COMPRESSION_METHOD &&
      compressionMethod !== DEFLATE_COMPRESSION_METHOD
    ) {
      return reject("malformed");
    }
    if ((flags & 0x1) !== 0) return reject("encrypted");

    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localCompressionMethod = view.getUint16(
      localHeaderOffset + 8,
      true,
    );
    const localCompressedSize = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedSize = view.getUint32(
      localHeaderOffset + 22,
      true,
    );
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localDataOffset =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
    const localDataEnd = localDataOffset + compressedSize;
    if (
      localFlags !== flags ||
      localCompressionMethod !== compressionMethod ||
      localNameLength !== nameLength ||
      localDataOffset > directoryOffset ||
      localDataEnd > directoryOffset ||
      ((flags & 0x8) === 0 &&
        (localCompressedSize !== compressedSize ||
          localUncompressedSize !== uncompressedSize))
    ) {
      return reject("malformed");
    }
    for (let nameIndex = 0; nameIndex < nameLength; nameIndex += 1) {
      if (
        bytes[localHeaderOffset + 30 + nameIndex] !==
        bytes[cursor + 46 + nameIndex]
      ) {
        return reject("malformed");
      }
    }
    localRanges.push([localHeaderOffset, localDataEnd]);

    let name: string;
    try {
      name = readEntryName(bytes, cursor + 46, nameLength);
    } catch {
      return reject("malformed");
    }
    const pathSegments = name.replaceAll("\\", "/").split("/");
    if (
      name.length === 0 ||
      name.includes("\0") ||
      name.includes("\\") ||
      name.includes(":") ||
      name.startsWith("/") ||
      name.startsWith("\\") ||
      pathSegments.includes("..")
    ) {
      return reject("unsafe-path");
    }
    if (names.has(name)) return reject("malformed");
    names.add(name);

    if (uncompressedSize > MAX_ARCHIVE_ENTRY_UNCOMPRESSED_BYTES) {
      return reject("expanded-too-large");
    }
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      return reject("expanded-too-large");
    }
    cursor = nextCursor;
  }

  if (cursor !== directoryOffset + directorySize) {
    return reject("malformed");
  }
  localRanges.sort((left, right) => left[0] - right[0]);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index - 1][1] > localRanges[index][0]) {
      return reject("malformed");
    }
  }
  if (
    totalUncompressed > 0 &&
    (totalCompressed === 0 ||
      totalUncompressed / totalCompressed > MAX_ARCHIVE_COMPRESSION_RATIO)
  ) {
    return reject("suspicious-compression");
  }
  if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) {
    return reject("not-workbook");
  }

  return { ok: true, entryCount, uncompressedBytes: totalUncompressed };
}
