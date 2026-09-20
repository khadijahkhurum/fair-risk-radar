// POST /api/controls/upload — parse a user-supplied control catalog
// (.yaml/.yml/.csv) and return it normalized. Never persisted: this is a
// single-tenant public demo, so writing an upload to the shared Control
// table would let one visitor overwrite what every other visitor sees. The
// frontend holds the parsed result in memory for that session only.
import { NextRequest, NextResponse } from "next/server";
import { parseCatalog, CatalogParseError } from "@/lib/catalog-parser";

const MAX_UPLOAD_BYTES = 512 * 1024; // 512KB — a control catalog is a few KB of text

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request must be multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing \"file\" field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds 512KB limit" }, { status: 413 });
  }

  try {
    const text = await file.text();
    const controls = parseCatalog(text, file.name);
    return NextResponse.json({ controls });
  } catch (err) {
    if (err instanceof CatalogParseError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("POST /api/controls/upload failed:", err);
    return NextResponse.json({ error: "Failed to parse uploaded catalog" }, { status: 500 });
  }
}
