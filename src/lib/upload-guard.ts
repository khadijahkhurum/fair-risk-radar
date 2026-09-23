// Evidence upload content validation (audit S9).
//
// The finding: the route trusted `accept=".csv,.txt"` and a filename regex.
// Both are client-side hints. A renamed ZIP, a PDF, or a binary with a .csv
// extension all passed.
//
// There is no magic number for CSV or plain text — "is this text?" is the
// actual question, and it is answerable: a strict UTF-8 decode that rejects
// NUL bytes and stray control characters. Known binary signatures are checked
// first purely so the error message can name what was actually sent, which is
// the difference between a user fixing their upload and filing a bug.
//
// What this deliberately does NOT do, and why:
//
// • No virus scanning. That needs a scanning service; claiming it without one
//   would be worse than not having it. The residual risk is bounded by what
//   happens to the bytes: they are decoded as text, parsed, stored in Postgres
//   and rendered as React children. They are never written to disk, never
//   executed, and never served back as a file.
//
// • No off-origin blob storage with signed reads. That control exists to stop
//   user-uploaded bytes being served from the app origin, where content
//   sniffing turns an upload into stored XSS. Nothing here serves the raw
//   bytes: the evidence viewer renders parsed rows and text through JSX, which
//   escapes. Adding S3 would add a dependency without removing a risk this
//   application has. It becomes necessary the moment a download link exists.

/** 1MB. Evidence is an access-review export or a patch report, not an archive. */
export const EVIDENCE_MAX_BYTES = 1024 * 1024;

export type UploadVerdict =
  | { ok: true; text: string }
  | { ok: false; status: 413 | 415 | 422; reason: string };

const ALLOWED_EXTENSIONS = /\.(csv|txt)$/i;

// Leading bytes of formats people actually rename. Checked to NAME the file
// type in the error, not as the security boundary — the UTF-8 decode below is
// the boundary, and it rejects every one of these anyway.
const BINARY_SIGNATURES: { name: string; bytes: number[] }[] = [
  { name: "a PDF", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { name: "a ZIP or Office file", bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK..
  { name: "a PNG image", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "a GIF image", bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: "a JPEG image", bytes: [0xff, 0xd8, 0xff] },
  { name: "a Windows executable", bytes: [0x4d, 0x5a] }, // MZ
  { name: "a Linux executable", bytes: [0x7f, 0x45, 0x4c, 0x46] }, // .ELF
  { name: "a legacy Office document", bytes: [0xd0, 0xcf, 0x11, 0xe0] },
  { name: "a gzip archive", bytes: [0x1f, 0x8b] },
  { name: "a RAR archive", bytes: [0x52, 0x61, 0x72, 0x21] },
  { name: "a 7-Zip archive", bytes: [0x37, 0x7a, 0xbc, 0xaf] },
  { name: "a SQLite database", bytes: [0x53, 0x51, 0x4c, 0x69] },
];

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

/**
 * Decide whether these bytes are the text evidence file they claim to be.
 *
 * @param bytes    the raw upload
 * @param filename as supplied by the client — a hint, never trusted alone
 */
export function inspectTextUpload(bytes: Uint8Array, filename: string): UploadVerdict {
  if (bytes.length === 0) {
    return { ok: false, status: 422, reason: "Uploaded file is empty." };
  }
  if (bytes.length > EVIDENCE_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      reason: `File exceeds the ${Math.round(EVIDENCE_MAX_BYTES / 1024)}KB limit.`,
    };
  }
  if (!ALLOWED_EXTENSIONS.test(filename)) {
    return { ok: false, status: 415, reason: "Only .csv or .txt files are supported." };
  }

  for (const sig of BINARY_SIGNATURES) {
    if (startsWith(bytes, sig.bytes)) {
      return {
        ok: false,
        status: 415,
        reason: `This looks like ${sig.name}, not a text file, whatever the extension says. Export it as CSV or plain text first.`,
      };
    }
  }

  // The real check. `fatal: true` rejects any byte sequence that is not valid
  // UTF-8, which is every binary format — including ones not listed above.
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      status: 415,
      reason: "File is not valid UTF-8 text. Save it as UTF-8 and try again.",
    };
  }

  // Strip a BOM — Excel writes one on CSV export and it would otherwise become
  // part of the first column header.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // A NUL survives UTF-8 validation but is never in a real text export; it is
  // the classic way to smuggle a payload past a text check.
  if (text.includes("\u0000")) {
    return { ok: false, status: 415, reason: "File contains NUL bytes, so it is not a text file." };
  }

  // C0 controls other than tab (9), LF (10), CR (13). A stray one usually
  // means a binary that happened to decode; a deliberate one is an attempt at
  // something. Written as a scan rather than a regex on purpose: a regex over
  // control characters trips eslint's no-control-regex, and suppressing a rule
  // that may not be loaded is itself a build error.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) {
      return {
        ok: false,
        status: 415,
        reason: "File contains control characters that do not belong in a text export.",
      };
    }
  }

  return { ok: true, text };
}
