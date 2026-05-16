import { google } from 'googleapis';
import path from 'path';
import type { InvoiceData, CalculationResult } from '@/types/invoice';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;
const KEY_PATH = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH!);

// ── Auth ──────────────────────────────────────────────────────────
async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Tipos ─────────────────────────────────────────────────────────
export interface ClienteRow {
  uc: string;
  nome: string;
  cpf: string;
  cnpj: string;
  endereco: string;
  economiaInicial: number;
}

export interface ClienteNaoEncontrado {
  found: false;
}

export interface ClienteEncontrado {
  found: true;
  cliente: ClienteRow;
  economiaAcumulada: number;
}

export type BuscaClienteResult = ClienteNaoEncontrado | ClienteEncontrado;

// ── Buscar cliente pela UC ─────────────────────────────────────────
export async function buscarClientePorUC(uc: string): Promise<BuscaClienteResult> {
  const sheets = await getSheets();

  // Lê aba Clientes
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Clientes!A2:F',
  });

  const rows = data.values ?? [];
  const row = rows.find(r => r[0]?.toString().trim() === uc.trim());

  if (!row) return { found: false };

  const cliente: ClienteRow = {
    uc: row[0] ?? '',
    nome: row[1] ?? '',
    cpf: row[2] ?? '',
    cnpj: row[3] ?? '',
    endereco: row[4] ?? '',
    economiaInicial: parseFloat((row[5] ?? '0').toString().replace(',', '.')) || 0,
  };

  // Soma descontos anteriores na aba do cliente
  const economiaDescontos = await somarDescontosAnteriores(sheets, cliente.nome);
  const economiaAcumulada = Math.round((cliente.economiaInicial + economiaDescontos) * 100) / 100;

  return { found: true, cliente, economiaAcumulada };
}

// ── Somar descontos gravados na aba do cliente ─────────────────────
async function somarDescontosAnteriores(
  sheets: Awaited<ReturnType<typeof getSheets>>,
  nomeCliente: string,
): Promise<number> {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${nomeCliente}!F2:F`, // coluna F = Desconto (R$)
    });

    const rows = data.values ?? [];
    return rows.reduce((sum, r) => {
      const v = parseFloat((r[0] ?? '0').toString().replace(',', '.'));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  } catch {
    // Aba ainda não existe (cliente novo)
    return 0;
  }
}

// ── Gravar registro na aba do cliente ─────────────────────────────
export async function gravarRegistro(
  invoice: InvoiceData,
  calc: CalculationResult,
): Promise<void> {
  const sheets = await getSheets();
  const aba = invoice.nomeCliente;

  const { sheetId, isNew } = await garantirAba(sheets, aba);
  await garantirCabecalho(sheets, aba);

  // Formatação não deve bloquear a gravação dos dados
  if (isNew) {
    formatarAbaCliente(sheets, sheetId).catch(() => { /* falha silenciosa de formatação */ });
  }

  // Impede gravar fatura duplicada: mês/ano + kWh + tarifa devem ser todos iguais
  const { data: registros } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${aba}!A2:C`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const jaExiste = registros.values?.some(r => {
    const consumo = Number(r[1] ?? NaN);
    const tarifa  = Number(r[2] ?? NaN);
    return (
      mesAnoParaString(r[0]) === invoice.mesAnoReferencia &&
      Math.abs(consumo - invoice.consumoKwh) < 0.5 &&
      Math.abs(tarifa  - invoice.tarifaComTributos) < 0.000002
    );
  });
  if (jaExiste) {
    throw new Error(
      `Fatura de ${invoice.mesAnoReferencia} com ${invoice.consumoKwh} kWh já foi lançada para ${invoice.nomeCliente}.`
    );
  }

  // Append nova linha
  // Prefixo ' força o Sheets a armazenar o mês/ano como texto, não como data serial
  const linha = [
    "'" + invoice.mesAnoReferencia,    // A - Mês/Ano (texto forçado)
    invoice.consumoKwh,                // B - Consumo (kWh)
    invoice.tarifaComTributos,         // C - Tarifa
    invoice.iluminacaoPublica,         // D - Ilum. Pública
    calc.valorBruto,                   // E - Valor Bruto
    calc.desconto,                     // F - Desconto (R$)
    calc.totalAPagar,                  // G - Total Pago
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${aba}!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [linha] },
  });
}

// ── Cadastrar cliente novo na aba Clientes ─────────────────────────
export async function cadastrarCliente(
  invoice: InvoiceData,
  economiaInicial: number,
): Promise<void> {
  const sheets = await getSheets();

  // Impede cadastrar UC já existente
  const jaExiste = await buscarClientePorUC(invoice.numeroUC);
  if (jaExiste.found) {
    throw new Error(`UC ${invoice.numeroUC} já está cadastrada para ${jaExiste.cliente.nome}.`);
  }

  // Verifica se a aba Clientes já tem banding — proxy correto de "já foi formatada"
  // (checar dados é frágil: usuário pode deletar linhas sem perder a formatação)
  const { data: meta } = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const clientesMeta = meta.sheets?.find(s => s.properties?.title === 'Clientes');
  const jaFormatada = (clientesMeta?.bandedRanges?.length ?? 0) > 0;

  // Garante cabeçalho
  const { data: header } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Clientes!A1:F1',
  });
  if (!header.values?.[0]?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Clientes!A1:F1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['UC', 'Nome', 'CPF', 'CNPJ', 'Endereço', 'Economia Inicial']],
      },
    });
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Clientes!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        invoice.numeroUC,
        invoice.nomeCliente,
        invoice.cpf   ?? '-----',
        invoice.cnpj  ?? '-----',
        invoice.endereco,
        economiaInicial,
      ]],
    },
  });

  if (!jaFormatada) {
    formatarAbaClientes(sheets).catch(() => { /* falha silenciosa de formatação */ });
  }
}

// ── Helpers ───────────────────────────────────────────────────────

// Normaliza o valor lido da coluna A para MM/AAAA.
// Sheets pode devolver string ("04/2025") ou número serial de data (ex: 46014)
// dependendo de como o valor foi originalmente gravado.
function mesAnoParaString(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') {
    // Sheets usa epoch 30/12/1899; 25569 é o offset para Unix epoch
    const d = new Date((val - 25569) * 86400 * 1000);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${mm}/${d.getUTCFullYear()}`;
  }
  return '';
}
async function garantirAba(
  sheets: Awaited<ReturnType<typeof getSheets>>,
  nome: string,
): Promise<{ sheetId: number; isNew: boolean }> {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = data.sheets?.find(s => s.properties?.title === nome);
  if (existing) return { sheetId: existing.properties!.sheetId!, isNew: false };

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: nome } } }],
    },
  });

  return {
    sheetId: res.data.replies![0].addSheet!.properties!.sheetId!,
    isNew: true,
  };
}

async function garantirCabecalho(
  sheets: Awaited<ReturnType<typeof getSheets>>,
  aba: string,
): Promise<void> {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${aba}!A1:G1`,
  });

  if (data.values?.[0]?.length) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${aba}!A1:G1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['Mês/Ano', 'Consumo (kWh)', 'Tarifa (R$/kWh)', 'Ilum. Pública', 'Valor Bruto', 'Desconto (R$)', 'Total Pago']],
    },
  });
}

async function formatarAbaClientes(
  sheets: Awaited<ReturnType<typeof getSheets>>,
): Promise<void> {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetId = data.sheets?.find(s => s.properties?.title === 'Clientes')?.properties?.sheetId;
  if (sheetId == null) return;

  const LARANJA = { red: 0.961, green: 0.486, blue: 0.000 };
  const BRANCO  = { red: 1.000, green: 1.000, blue: 1.000 };
  const FUNDO1  = { red: 1.000, green: 1.000, blue: 1.000 };
  const FUNDO2  = { red: 0.996, green: 0.953, blue: 0.918 };
  const COLS = 6;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
            cell: {
              userEnteredFormat: {
                backgroundColor: LARANJA,
                textFormat: { foregroundColor: BRANCO, bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
          },
        },
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
            bottom: { style: 'SOLID_MEDIUM', color: { red: 0.7, green: 0.3, blue: 0 } },
          },
        },
        {
          addBanding: {
            bandedRange: {
              range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endRowIndex: 1000, endColumnIndex: COLS },
              rowProperties: { firstBandColor: FUNDO1, secondBandColor: FUNDO2 },
            },
          },
        },
        // Economia Inicial — formato moeda (col F = índice 5)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
            cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '"R$"\\ #,##0.00' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        },
        // Larguras: UC, Nome, CPF, CNPJ, Endereço, Economia Inicial
        ...[110, 210, 130, 150, 260, 140].map((px, i) => ({
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
            properties: { pixelSize: px },
            fields: 'pixelSize',
          },
        })),
      ],
    },
  });
}

async function formatarAbaCliente(
  sheets: Awaited<ReturnType<typeof getSheets>>,
  sheetId: number,
): Promise<void> {
  const LARANJA  = { red: 0.961, green: 0.486, blue: 0.000 }; // #F57C00
  const BRANCO   = { red: 1.000, green: 1.000, blue: 1.000 };
  const FUNDO1   = { red: 1.000, green: 1.000, blue: 1.000 }; // linhas ímpares
  const FUNDO2   = { red: 0.996, green: 0.953, blue: 0.918 }; // linhas pares — laranja bem claro
  const COLS = 7;

  const moeda    = { numberFormat: { type: 'NUMBER', pattern: '"R$"\\ #,##0.00' } };
  const tarifa   = { numberFormat: { type: 'NUMBER', pattern: '"R$"\\ #,##0.000000' } };
  const centro   = { horizontalAlignment: 'CENTER' };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // Congelar linha do cabeçalho
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },

        // Cabeçalho: fundo laranja, texto branco negrito centralizado
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
            cell: {
              userEnteredFormat: {
                backgroundColor: LARANJA,
                textFormat: { foregroundColor: BRANCO, bold: true, fontSize: 10 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
          },
        },

        // Borda inferior do cabeçalho
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
            bottom: { style: 'SOLID_MEDIUM', color: { red: 0.7, green: 0.3, blue: 0 } },
          },
        },

        // Linhas alternadas (banding)
        {
          addBanding: {
            bandedRange: {
              range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endRowIndex: 1000, endColumnIndex: COLS },
              rowProperties: {
                firstBandColor: FUNDO1,
                secondBandColor: FUNDO2,
              },
            },
          },
        },

        // Formato de tarifa — coluna C (índice 2)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
            cell: { userEnteredFormat: { ...tarifa, ...centro } },
            fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
          },
        },

        // Formato de moeda — colunas D, E, F, G (índices 3–6)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: COLS },
            cell: { userEnteredFormat: moeda },
            fields: 'userEnteredFormat.numberFormat',
          },
        },

        // Consumo (kWh) centralizado — coluna B (índice 1)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: centro },
            fields: 'userEnteredFormat.horizontalAlignment',
          },
        },

        // Larguras de coluna: Mês/Ano, Consumo, Tarifa, Ilum, V.Bruto, Desconto, Total
        ...[95, 105, 130, 120, 110, 115, 115].map((px, i) => ({
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
            properties: { pixelSize: px },
            fields: 'pixelSize',
          },
        })),
      ],
    },
  });
}
