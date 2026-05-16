import { NextRequest, NextResponse } from 'next/server';
import { gravarRegistro, cadastrarCliente } from '@/lib/sheets';
import type { InvoiceData, CalculationResult } from '@/types/invoice';

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    invoice: InvoiceData;
    calculation: CalculationResult;
    cadastrarNovo?: { economiaInicial: number };
  };

  const { invoice, calculation, cadastrarNovo } = body;

  try {
    if (cadastrarNovo) {
      await cadastrarCliente(invoice, cadastrarNovo.economiaInicial);
    }
    await gravarRegistro(invoice, calculation);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao gravar na planilha';
    return NextResponse.json({ success: false, error: msg }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
