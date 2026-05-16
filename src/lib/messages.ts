import type { InvoiceData, CalculationResult } from '@/types/invoice';

const CNPJ_PIX = process.env.NEXT_PUBLIC_CNPJ_PIX ?? '52668513000179';

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function gerarMensagens(invoice: InvoiceData, calc: CalculationResult) {
  const bloco1 = `📊 *RELATÓRIO DE CONSUMO* – ${invoice.mesAnoReferencia}

👤 *Cliente:* ${invoice.nomeCliente}

━━━━━━━━━━━━━━━━━━

⚡ *Consumo do mês:* ${invoice.consumoKwh} kWh
🏷️ *Tarifa aplicada:* R$ ${invoice.tarifaComTributos.toFixed(6)}/kWh
💡 *Iluminação pública:* R$ ${brl(calc.iluminacaoPublica)}

🧾 *Valor sem desconto:* R$ ${brl(calc.valorBruto)}
✅ *Valor com desconto:* R$ ${brl(calc.valorLiquido)}
💸 *Economia do mês:* R$ ${brl(calc.economiaMes)}

━━━━━━━━━━━━━━━━━━

💰 *TOTAL A PAGAR:* R$ ${brl(calc.totalAPagar)}

🏆 *Economia acumulada:* R$ ${brl(calc.economiaAcumulada)}

━━━━━━━━━━━━━━━━━━

🔑 *Chave para pagamento via PIX (CNPJ):*`;

  return { bloco1, bloco2: CNPJ_PIX };
}
