import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const totalCount = await prisma.question.count({
      where: { isActive: true },
    });

    const categories = await prisma.question.groupBy({
      by: ["category"],
      _count: { id: true },
      where: { isActive: true },
    });

    return NextResponse.json({
      totalQuestions: totalCount,
      categories: categories.map((c) => ({
        category: c.category,
        count: c._count.id,
      })),
    });
  } catch (error) {
    console.error("GET /api/questions error:", error);
    return NextResponse.json({ error: "Failed to fetch question statistics" }, { status: 500 });
  }
}
