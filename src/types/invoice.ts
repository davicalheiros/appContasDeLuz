export interface InvoiceData {
  nomeCliente: string;
  cpf: string | null;
  cnpj: string | null;
  endereco: string;
  numeroUC: string;
  mesAnoReferencia: string;
  consumoKwh: number;
  tarifaComTributos: number;
  valorConsumoCompensado: number;
  iluminacaoPublica: number;
}

export interface ParseResult {
  success: boolean;
  data?: InvoiceData;
  error?: string;
  rawText?: string;
}

export interface CalculationResult {
  valorBruto: number;
  desconto: number;
  valorLiquido: number;
  iluminacaoPublica: number;
  totalAPagar: number;
  economiaMes: number;
  economiaAcumulada: number; // preenchida após consulta ao Sheets
}

export interface BillResult {
  invoice: InvoiceData;
  calculation: CalculationResult;
}
