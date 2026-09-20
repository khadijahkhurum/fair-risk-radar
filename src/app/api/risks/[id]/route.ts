// PATCH /api/risks/[id] — update a risk's status, owner, ratings, or linked assessment.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const VALID_STATUSES = ["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"];

function isRating(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { status, ownerName, inherentLikelihood, inherentImpact, residualLikelihood, residualImpact, latestAssessmentId } =
    (body ?? {}) as Record<string, unknown>;

  const data: Prisma.RiskUpdateInput = {};

  if (status !== undefined) {
    if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    data.status = status as Prisma.RiskUpdateInput["status"];
  }
  if (ownerName !== undefined) {
    if (typeof ownerName !== "string" || !ownerName) {
      return NextResponse.json({ error: "ownerName must be a non-empty string" }, { status: 400 });
    }
    data.ownerName = ownerName;
  }
  for (const [key, value] of [
    ["inherentLikelihood", inherentLikelihood],
    ["inherentImpact", inherentImpact],
    ["residualLikelihood", residualLikelihood],
    ["residualImpact", residualImpact],
  ] as const) {
    if (value !== undefined) {
      if (!isRating(value)) {
        return NextResponse.json({ error: `${key} must be an integer 1-5` }, { status: 400 });
      }
      (data as Record<string, number>)[key] = value;
    }
  }
  if (latestAssessmentId !== undefined) {
    if (latestAssessmentId !== null && typeof latestAssessmentId !== "string") {
      return NextResponse.json({ error: "latestAssessmentId must be a string or null" }, { status: 400 });
    }
    data.latestAssessment = latestAssessmentId
      ? { connect: { id: latestAssessmentId } }
      : { disconnect: true };
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const risk = await prisma.risk.update({ where: { id: params.id }, data });
    return NextResponse.json({ risk });
  } catch (err) {
    console.error("PATCH /api/risks/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update risk (does it exist?)" }, { status: 404 });
  }
}
