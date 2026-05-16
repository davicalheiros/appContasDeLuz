import type { InvoiceData, ParseResult } from '@/types/invoice';
import type * as PdfJsLib from 'pdfjs-dist';

interface RawItem {
  str: string;
  x: number;
  y: number;
}

async function extractItems(buffer: Buffer): Promise<RawItem[]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as typeof PdfJsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = `file://${process.cwd()}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;

  const doc = await pdfjs
    .getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, useSystemFonts: true })
    .promise;

  const allItems: RawItem[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        const [, , , , tx, ty] = item.transform as number[];
        allItems.push({ str: item.str, x: tx, y: viewport.height - ty });
      }
    }
  }

  return allItems;
}

function buildLines(items: RawItem[]): string[] {
  const TOLERANCE = 3;
  const groups = new Map<number, RawItem[]>();

  for (const item of items) {
    let key: number | undefined;
    for (const y of groups.keys()) {
      if (Math.abs(item.y - y) <= TOLERANCE) { key = y; break; }
    }
    if (key === undefined) { key = item.y; groups.set(key, []); }
    groups.get(key)!.push(item);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([, items]) =>
      items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()
    )
    .filter(l => l.length > 0);
}

function brToFloat(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

export async function parsePDF(buffer: Buffer): Promise<ParseResult> {
  try {
    const items = await extractItems(buffer);
    const lines = buildLines(items);
    const rawText = lines.join('\n');

    // ── UC ────────────────────────────────────────────────────────
    const numeroUC = (() => {
      for (const line of lines) {
        const m = line.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
        if (m) return m[1];
      }
      return null;
    })();

    // ── Mês/Ano — evita capturar o dia em datas DD/MM/AAAA ───────
    const mesAnoReferencia = (() => {
      for (const line of lines) {
        // Prioridade: linha que COMEÇA com MM/AAAA
        const start = line.match(/^((?:0[1-9]|1[0-2])\/20[2-9]\d)\b/);
        if (start) return start[1];
      }
      for (const line of lines) {
        // Fallback: MM/AAAA que NÃO está precedido por dígito+barra (não é parte de DD/MM/AAAA)
        const m = line.match(/(?<!\d\/)((?:0[1-9]|1[0-2])\/20[2-9]\d)(?!\/)/);
        if (m) return m[1];
      }
      return null;
    })();

    // ── CPF ───────────────────────────────────────────────────────
    const cpf = (() => {
      for (const line of lines) {
        const m = line.match(/CPF[:/\s]+([\d.*-]+)/i);
        if (m) return m[1].trim();
      }
      // fallback: qualquer sequência com asteriscos no formato CPF
      for (const line of lines) {
        const m = line.match(/([\d*]{3}\.[\d*]{3}\.[\d*]{3}-[\d*]{2})/);
        if (m && m[1].includes('*')) return m[1];
      }
      return null;
    })();

    // ── CNPJ ──────────────────────────────────────────────────────
    const cnpj = (() => {
      for (const line of lines) {
        const m = line.match(/CNPJ[:/\s]+([\d.\/\-]+)/i);
        if (m) return m[1].trim();
      }
      // fallback: padrão XX.XXX.XXX/XXXX-XX
      for (const line of lines) {
        const m = line.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
        if (m) return m[1];
      }
      return null;
    })();

    // ── Nome (ALL CAPS antes de uma data) ─────────────────────────
    let nomeCliente = '';
    for (const line of lines) {
      const m = line.match(/^([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÜ]{2,}(?:\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÜ]{2,})+)\s+\d/);
      if (m) { nomeCliente = m[1].trim(); break; }
    }

    // ── Endereço ──────────────────────────────────────────────────
    let endereco = '';
    for (let i = 0; i < lines.length; i++) {
      if (/^(?:R\.|RUA|AV\.|AVENIDA|PC\.|PRAÇA|TR\.)\s/i.test(lines[i])) {
        endereco = lines[i].trim();
        if (i + 1 < lines.length && /^CEP:/i.test(lines[i + 1])) {
          const cepLine = lines[i + 1].replace(/\s+(?:NOTA FISCAL|NF|SÉRIE|SERIE|DATA DE EMISSÃO).*/i, '').trim();
          endereco += ' | ' + cepLine;
        }
        break;
      }
      if (/endere[çc]o/i.test(lines[i])) {
        const next = lines.slice(i + 1, i + 4).find(l => l.length > 10);
        if (next) { endereco = next; break; }
      }
    }

    // ── Consumo Compensado: kWh, tarifa, valor ────────────────────
    let consumoKwh: number | null = null;
    let tarifaComTributos: number | null = null;
    let valorConsumoCompensado: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      if (/consumo\s+compensado\s+\(kWh\)/i.test(lines[i])) {
        const ctx = lines.slice(Math.max(0, i - 1), i + 4).join(' ');
        const nums = ctx.match(/\d+(?:[.,]\d+)*/g) ?? [];

        // kWh: primeiro inteiro >= 50
        for (const n of nums) {
          const v = brToFloat(n);
          if (Number.isInteger(v) && v >= 50 && v < 100000) {
            consumoKwh = v;
            break;
          }
        }

        // tarifa com tributos: primeiro decimal entre 0,1 e 2,0 (após o kWh)
        let pastKwh = false;
        for (const n of nums) {
          const v = brToFloat(n);
          if (!pastKwh && consumoKwh !== null && v === consumoKwh) { pastKwh = true; continue; }
          if (pastKwh && v > 0.1 && v < 2.0) { tarifaComTributos = v; break; }
        }

        // valor total: número mais próximo de consumo × tarifa (dentre os > 50)
        if (consumoKwh !== null && tarifaComTributos !== null) {
          const expected = consumoKwh * tarifaComTributos;
          let closestDiff = Infinity;
          for (const n of nums) {
            const v = brToFloat(n);
            if (v > 50) {
              const diff = Math.abs(v - expected);
              if (diff < closestDiff) { closestDiff = diff; valorConsumoCompensado = v; }
            }
          }
        }
        break;
      }
    }

    // ── Iluminação Pública (CIP) ──────────────────────────────────
    let iluminacaoPublica: number | null = null;
    for (const line of lines) {
      if (/cip|iluminaç[aã]o\s*p[úu]blica|ilum\.?\s*pub/i.test(line)) {
        const nums = line.match(/(\d+[.,]\d+)/g);
        if (nums?.length) { iluminacaoPublica = brToFloat(nums[nums.length - 1]); break; }
      }
    }

    // ── Validação ─────────────────────────────────────────────────
    const missing: string[] = [];
    if (!nomeCliente) missing.push('nome do cliente');
    if (!cpf && !cnpj) missing.push('CPF ou CNPJ');
    if (!endereco) missing.push('endereço');
    if (!numeroUC) missing.push('número da UC');
    if (!mesAnoReferencia) missing.push('mês/ano de referência');
    if (consumoKwh === null) missing.push('consumo kWh');
    if (tarifaComTributos === null) missing.push('tarifa com tributos');
    if (valorConsumoCompensado === null) missing.push('valor consumo compensado');
    if (iluminacaoPublica === null) missing.push('iluminação pública');

    if (missing.length > 0) {
      return { success: false, error: `Campos não encontrados: ${missing.join(', ')}`, rawText };
    }

    return {
      success: true,
      data: {
        nomeCliente,
        cpf: cpf ?? null,
        cnpj: cnpj ?? null,
        endereco,
        numeroUC: numeroUC!,
        mesAnoReferencia: mesAnoReferencia!,
        consumoKwh: consumoKwh!,
        tarifaComTributos: tarifaComTributos!,
        valorConsumoCompensado: valorConsumoCompensado!,
        iluminacaoPublica: iluminacaoPublica!,
      },
      rawText,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
}
