import { NextResponse } from "next/server";
import { publicTldCatalog } from "@/app/api/_lib/domain-api";

export async function GET() {
  return NextResponse.json(publicTldCatalog());
}
