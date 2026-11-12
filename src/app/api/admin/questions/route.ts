import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CURATED_QUESTIONS, FallbackQuestion } from "@/lib/curatedQuestions";
import { verifyAdminSecret } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvQuestions(csvText: string): Omit<FallbackQuestion, "id">[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const parsed: Omit<FallbackQuestion, "id">[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    // Skip header row if detected
    if (
      i === 0 &&
      (cols[0].toLowerCase().includes("question") || cols[0].toLowerCase().includes("category"))
    ) {
      continue;
    }

    // Support either:
    // Format A: questionText, optionA, optionB, optionC, optionD, correctOptionIndex, [category]
    // Format B: category, questionText, optionA, optionB, optionC, optionD, correctOptionIndex
    if (cols.length >= 6) {
      const isFormatB =
        cols.length >= 7 &&
        !Number.isNaN(Number(cols[6])) &&
        Number(cols[6]) >= 0 &&
        Number(cols[6]) <= 3;

      const category = isFormatB ? cols[0] || "GENERAL_KNOWLEDGE" : cols[6] || "GENERAL_KNOWLEDGE";
      const questionText = isFormatB ? cols[1] : cols[0];
      const options = isFormatB
        ? [cols[2], cols[3], cols[4], cols[5]]
        : [cols[1], cols[2], cols[3], cols[4]];
      const correctOptionIndex = Number(isFormatB ? cols[6] : cols[5]);

      if (
        questionText &&
        options.every((o) => Boolean(o)) &&
        !Number.isNaN(correctOptionIndex) &&
        correctOptionIndex >= 0 &&
        correctOptionIndex <= 3
      ) {
        parsed.push({
          category: category.toUpperCase().replace(/\s+/g, "_"),
          questionText,
          options,
          correctOptionIndex,
          isActive: true,
        });
      }
    }
  }

  return parsed;
}

export async function GET(request: Request) {
  if (!verifyAdminSecret(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Valid ADMIN_SECRET required." },
      { status: 401 }
    );
  }

  try {
    const dbQuestions = await prisma.question.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (dbQuestions && dbQuestions.length > 0) {
      const normalized = dbQuestions.map((q) => ({
        id: q.id,
        category: q.category,
        questionText: q.questionText,
        options: Array.isArray(q.options)
          ? (q.options as string[])
          : typeof q.options === "string"
          ? JSON.parse(q.options)
          : ["A", "B", "C", "D"],
        correctOptionIndex: q.correctOptionIndex,
        isActive: q.isActive,
        createdAt: q.createdAt.toISOString(),
      }));

      return NextResponse.json({
        questions: normalized,
        totalCount: normalized.length,
        activeCount: normalized.filter((q) => q.isActive).length,
        source: "DATABASE",
      });
    }
  } catch (err) {
    console.warn("GET /api/admin/questions DB fallback:", err);
  }

  return NextResponse.json({
    questions: CURATED_QUESTIONS,
    totalCount: CURATED_QUESTIONS.length,
    activeCount: CURATED_QUESTIONS.filter((q) => q.isActive !== false).length,
    source: "IN_MEMORY",
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!verifyAdminSecret(request, body)) {
    return NextResponse.json(
      { error: "Unauthorized. Valid ADMIN_SECRET required." },
      { status: 401 }
    );
  }

  // Support single question OR bulk import (JSON array or CSV string)
  let incomingQuestions: Omit<FallbackQuestion, "id">[] = [];

  if (typeof body.csvData === "string" && body.csvData.trim()) {
    incomingQuestions = parseCsvQuestions(body.csvData);
  } else if (Array.isArray(body.questions)) {
    incomingQuestions = body.questions
      .filter(
        (q: any) =>
          q &&
          typeof q.questionText === "string" &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correctOptionIndex === "number" &&
          q.correctOptionIndex >= 0 &&
          q.correctOptionIndex <= 3
      )
      .map((q: any) => ({
        category: String(q.category || "GENERAL_KNOWLEDGE")
          .trim()
          .toUpperCase(),
        questionText: String(q.questionText).trim(),
        options: q.options.map((o: any) => String(o).trim()),
        correctOptionIndex: Number(q.correctOptionIndex),
        isActive: q.isActive !== false,
      }));
  } else if (body.questionText && Array.isArray(body.options) && body.options.length === 4) {
    const idx = Number(body.correctOptionIndex);
    if (Number.isNaN(idx) || idx < 0 || idx > 3) {
      return NextResponse.json(
        { error: "correctOptionIndex must be between 0 and 3." },
        { status: 400 }
      );
    }
    incomingQuestions = [
      {
        category: String(body.category || "GENERAL_KNOWLEDGE")
          .trim()
          .toUpperCase(),
        questionText: String(body.questionText).trim(),
        options: body.options.map((o: any) => String(o).trim()),
        correctOptionIndex: idx,
        isActive: body.isActive !== false,
      },
    ];
  }

  if (incomingQuestions.length === 0) {
    return NextResponse.json(
      {
        error:
          "No valid questions found. Provide { questionText, options (4), correctOptionIndex (0-3) }, { questions: [...] }, or { csvData: '...' }.",
      },
      { status: 400 }
    );
  }

  const createdQuestions: FallbackQuestion[] = [];

  for (const item of incomingQuestions) {
    let createdId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const dbQ = await prisma.question.create({
        data: {
          category: item.category,
          questionText: item.questionText,
          options: item.options,
          correctOptionIndex: item.correctOptionIndex,
          isActive: item.isActive,
        },
      });
      createdId = dbQ.id;
    } catch (err) {
      console.warn("POST /api/admin/questions DB fallback:", err);
    }

    const qObj: FallbackQuestion = {
      id: createdId,
      category: item.category,
      questionText: item.questionText,
      options: item.options,
      correctOptionIndex: item.correctOptionIndex,
      isActive: item.isActive,
      createdAt: new Date().toISOString(),
    };

    CURATED_QUESTIONS.unshift(qObj);
    createdQuestions.push(qObj);
  }

  return NextResponse.json({
    success: true,
    importedCount: createdQuestions.length,
    questions: createdQuestions,
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!verifyAdminSecret(request, body)) {
    return NextResponse.json(
      { error: "Unauthorized. Valid ADMIN_SECRET required." },
      { status: 401 }
    );
  }

  const { id, isActive } = body;
  if (!id || typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "Both id and boolean isActive are required." },
      { status: 400 }
    );
  }

  let updated: any = null;
  try {
    updated = await prisma.question.update({
      where: { id: String(id) },
      data: { isActive },
    });
  } catch (err) {
    console.warn("PATCH /api/admin/questions DB fallback:", err);
  }

  const memQ = CURATED_QUESTIONS.find((q) => q.id === String(id));
  if (memQ) {
    memQ.isActive = isActive;
    if (!updated) {
      updated = memQ;
    }
  }

  if (!updated) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    question: updated,
  });
}
