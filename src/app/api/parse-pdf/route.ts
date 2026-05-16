import { NextRequest, NextResponse } from 'next/server';
import { parsePDF } from '@/lib/pdf-parser';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('pdf') as File | null;

  if (!file) {
    return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ success: false, error: 'Arquivo deve ser um PDF' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parsePDF(buffer);

  // Expose rawText only in development for debugging
  if (process.env.NODE_ENV === 'production') {
    delete result.rawText;
  }

  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
