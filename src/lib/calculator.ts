import type { InvoiceData, CalculationResult } from '@/types/invoice';

const VALIDATION_TOLERANCE = 0.02;

export interface ValidationError {
  calculado: number;
  referencia: number;
  diferenca: number;
}

export interface CalcResult {
  success: boolean;
  data?: CalculationResult;
  validationError?: ValidationError;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculate(
  invoice: InvoiceData,
  discountPercent: number,
  economiaAcumulada = 0,
  force = false,
): CalcResult {
  const { consumoKwh, tarifaComTributos, valorConsumoCompensado, iluminacaoPublica } = invoice;

  // ── Validação ─────────────────────────────────────────────────
  const calculado = round2(consumoKwh * tarifaComTributos);
  const referencia = round2(valorConsumoCompensado);
  const diferenca = round2(Math.abs(calculado - referencia));

  if (!force && diferenca > VALIDATION_TOLERANCE) {
    return { success: false, validationError: { calculado, referencia, diferenca } };
  }

  // ── Cálculo ───────────────────────────────────────────────────
  // Se forçado, usa o valor do PDF como base (conta de empresa pode ter estrutura diferente)
  const valorBruto = force ? referencia : calculado;
  const desconto = round2(valorBruto * (discountPercent / 100));
  const valorLiquido = round2(valorBruto - desconto);
  const totalAPagar = round2(valorLiquido + iluminacaoPublica); // CIP entra depois do desconto
  const economiaMes = desconto;

  return {
    success: true,
    data: {
      valorBruto,
      desconto,
      valorLiquido,
      iluminacaoPublica,
      totalAPagar,
      economiaMes,
      economiaAcumulada,
    },
  };
}
