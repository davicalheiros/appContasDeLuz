import { NextRequest, NextResponse } from 'next/server';
import { parsePDF } from '@/lib/pdf-parser';
import { calculate } from '@/lib/calculator';
import { buscarClientePorUC } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('pdf') as File | null;
  const discountPercent = Number(formData.get('discount') ?? process.env.NEXT_PUBLIC_DEFAULT_DISCOUNT ?? 20);
  const force = formData.get('force') === 'true';

  if (!file) {
    return NextResponse.json({ success: false, error: 'Nenhum arquivo enviado' }, { status: 400 });
  }

  // 1. Parse PDF
  const buffer = Buffer.from(await file.arrayBuffer());
  const parseResult = await parsePDF(buffer);

  if (!parseResult.success || !parseResult.data) {
    return NextResponse.json({ success: false, step: 'parse', error: parseResult.error }, { status: 422 });
  }

  const invoice = parseResult.data;

  // 2. Buscar cliente no Sheets (para economia acumulada)
  const clienteResult = await buscarClientePorUC(invoice.numeroUC);

  // 3. Calcular com economia acumulada (se cliente existir)
  const economiaAcumuladaAnterior = clienteResult.found ? clienteResult.economiaAcumulada : 0;
  const calcResult = calculate(invoice, discountPercent, economiaAcumuladaAnterior, force);

  if (!calcResult.success) {
    const e = calcResult.validationError!;
    return NextResponse.json({
      success: false,
      step: 'validation',
      invoice,
      clienteExistente: clienteResult.found,
      discountPercent,
      validationError: e,
      error: `Valor calculado (R$ ${e.calculado.toFixed(2)}) difere do PDF (R$ ${e.referencia.toFixed(2)}) em R$ ${e.diferenca.toFixed(2)}. Isso pode ocorrer em contas de empresa. Você pode prosseguir mesmo assim.`,
    }, { status: 422 });
  }

  const calc = calcResult.data!;

  // economia acumulada final = anterior + desconto do mês atual
  const economiaAcumuladaFinal = Math.round((economiaAcumuladaAnterior + calc.economiaMes) * 100) / 100;
  calc.economiaAcumulada = economiaAcumuladaFinal;

  return NextResponse.json({
    success: true,
    clienteExistente: clienteResult.found,
    invoice,
    calculation: calc,
    discountPercent,
  });
}
