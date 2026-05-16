'use client';

import { useRef, useState } from 'react';
import type { InvoiceData, CalculationResult } from '@/types/invoice';
import { gerarMensagens } from '@/lib/messages';

type Step = 'idle' | 'processing' | 'preview' | 'saving' | 'saved' | 'validationWarning';

interface ValidationError { calculado: number; referencia: number; diferenca: number; }

interface ProcessResponse {
  success: boolean;
  clienteExistente: boolean;
  invoice: InvoiceData;
  calculation: CalculationResult;
  discountPercent: number;
  validationError?: ValidationError;
  error?: string;
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" onClick={copy} style={{
      fontSize: 12, padding: '4px 12px', borderRadius: 6,
      background: copied ? '#166534' : '#374151',
      color: copied ? '#86efac' : '#d1d5db',
      border: '1px solid #4b5563', cursor: 'pointer',
    }}>
      {copied ? '✅ Copiado!' : '📋 Copiar'}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(17,24,39,0.85)', backdropFilter: 'blur(6px)', border: '1px solid rgba(55,65,81,0.7)', borderRadius: 12, padding: 24 }}>
      {children}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid #374151' }}>
      <span style={{ color: '#9ca3af', fontSize: 14 }}>{label}</span>
      <span style={{ color: accent ?? '#f3f4f6', fontWeight: 500, fontSize: 14 }}>{value}</span>
    </div>
  );
}

export default function Home() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [discount, setDiscount] = useState(Number(process.env.NEXT_PUBLIC_DEFAULT_DISCOUNT ?? 20));
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [error, setError] = useState('');
  const [economiaInicial, setEconomiaInicial] = useState('0');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFileName(e.target.files?.[0]?.name ?? null);
  }

  function handleProcess() {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert('Selecione um PDF primeiro'); return; }
    processFile(file);
  }

  async function processFile(file: File, force = false) {
    setStep('processing');
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('pdf', file);
      form.append('discount', String(discount));
      if (force) form.append('force', 'true');
      const res = await fetch('/api/process', { method: 'POST', body: form });
      const json: ProcessResponse = await res.json();
      if (!json.success) {
        if (json.validationError && json.invoice) {
          setResult(json);
          setStep('validationWarning');
        } else {
          setError(json.error ?? 'Erro desconhecido');
          setStep('idle');
        }
        return;
      }
      setResult(json);
      setStep('preview');
    } catch (e) {
      setError(String(e));
      setStep('idle');
    }
  }

  async function handleSave() {
    if (!result) return;

    const body: Record<string, unknown> = { invoice: result.invoice, calculation: result.calculation };

    if (!result.clienteExistente) {
      const valorEconomia = economiaInicial.trim().replace(',', '.');
      const parsed = parseFloat(valorEconomia);
      if (valorEconomia === '' || isNaN(parsed) || parsed < 0) {
        setError('Informe um valor válido para a economia inicial (use 0 caso não haja saldo retroativo).');
        return;
      }
      body.cadastrarNovo = { economiaInicial: parsed };
    }

    setStep('saving');
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Erro ao salvar');
      setStep('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('preview');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleReset() {
    setStep('idle'); setResult(null); setError(''); setEconomiaInicial('0'); setSelectedFileName(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const msgs = result ? gerarMensagens(result.invoice, result.calculation) : null;

  const inputStyle = {
    background: 'rgba(17,24,39,0.7)', border: '1px solid #374151', borderRadius: 6,
    color: '#f3f4f6', padding: '8px 12px', fontSize: 14, outline: 'none',
  };

  const btnPrimary = (disabled?: boolean) => ({
    flex: 1, padding: '12px 0', borderRadius: 8, border: 'none',
    background: disabled ? '#1d4ed8' : '#2563eb', color: '#fff',
    fontWeight: 600, fontSize: 15, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  });

  const btnSecondary = {
    flex: 1, padding: '12px 0', borderRadius: 8,
    border: '1px solid #6b7280', background: 'rgba(17,24,39,0.8)',
    backdropFilter: 'blur(4px)',
    color: '#e5e7eb', fontWeight: 500, fontSize: 15, cursor: 'pointer',
  };

  const btnGreen = (disabled?: boolean) => ({
    flex: 1, padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#16a34a', color: '#fff',
    fontWeight: 600, fontSize: 15, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div className="app-bg" style={{ color: '#f3f4f6', position: 'relative' }}>
      {/* Fundo fixo — mantém resolução e enquadramento independente do tamanho da página */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: -1,
        backgroundImage: 'url(/bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }} />
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{
          textAlign: 'center', padding: '16px 24px',
          background: 'rgba(17,24,39,0.85)', backdropFilter: 'blur(6px)',
          border: '1px solid rgba(55,65,81,0.7)', borderRadius: 12,
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>☀️ Solar MCZ</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4, marginBottom: 0 }}>Processamento de faturas Equatorial Alagoas</p>
        </div>

        {/* Erro */}
        {error && (
          <div style={{ background: 'rgba(69,10,10,0.85)', backdropFilter: 'blur(6px)', border: '1px solid #991b1b', borderRadius: 8, padding: 16, color: '#fca5a5', fontSize: 14 }}>
            ❌ {error}
          </div>
        )}

        {/* AVISO DE VALIDAÇÃO */}
        {step === 'validationWarning' && result?.validationError && (
          <div style={{ background: 'rgba(66,32,6,0.9)', backdropFilter: 'blur(6px)', border: '1px solid #d97706', borderRadius: 12, padding: 20 }}>
            <p style={{ fontWeight: 700, color: '#fbbf24', marginBottom: 8, fontSize: 15 }}>⚠️ Divergência no valor da fatura</p>
            <p style={{ color: '#fcd34d', fontSize: 13, marginBottom: 12 }}>
              O valor calculado (<strong>R$ {brl(result.validationError.calculado)}</strong>) difere do valor no PDF (<strong>R$ {brl(result.validationError.referencia)}</strong>) em <strong>R$ {brl(result.validationError.diferenca)}</strong>.
              Isso é comum em contas de empresa com tarifas diferenciadas.
            </p>
            <p style={{ color: '#fcd34d', fontSize: 13, marginBottom: 16 }}>
              Se os dados extraídos estiverem corretos, você pode prosseguir. O cálculo usará o valor do PDF como base.
            </p>
            <div className="app-btn-row" style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={handleReset} style={btnSecondary}>↩️ Cancelar</button>
              <button type="button"
                onClick={() => { const f = fileRef.current?.files?.[0]; if (f) processFile(f, true); }}
                style={{ ...btnGreen(), flex: 1 }}>
                ✅ Prosseguir mesmo assim
              </button>
            </div>
          </div>
        )}

        {/* UPLOAD */}
        {(step === 'idle' || step === 'processing') && (
          <Card>
            <p style={{ fontWeight: 600, marginBottom: 16, color: '#e5e7eb' }}>📤 Upload da fatura</p>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', padding: '14px 0', marginBottom: 16,
                borderRadius: 8, border: '2px dashed',
                borderColor: selectedFileName ? '#2563eb' : '#4b5563',
                background: selectedFileName ? 'rgba(30,58,95,0.7)' : 'rgba(17,24,39,0.5)',
                color: selectedFileName ? '#93c5fd' : '#9ca3af',
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ fontSize: 20 }}>{selectedFileName ? '📄' : '📂'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                {selectedFileName ?? 'Clique para selecionar o PDF da fatura'}
              </span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <label style={{ color: '#9ca3af', fontSize: 14 }}>Desconto (%):</label>
              <input
                type="number" value={discount}
                onChange={e => setDiscount(Number(e.target.value))}
                style={{ ...inputStyle, width: 80, textAlign: 'center' }}
                min={0} max={100}
              />
            </div>

            <button type="button" onClick={handleProcess} disabled={step === 'processing'}
              style={{ ...btnPrimary(step === 'processing'), flex: 'none', width: '100%' }}>
              {step === 'processing' ? '⏳ Processando...' : '🔍 Processar fatura'}
            </button>
          </Card>
        )}

        {/* PREVIEW */}
        {(step === 'preview' || step === 'saving' || step === 'saved') && result && (
          <>
            {/* Cliente */}
            <Card>
              <p style={{ fontWeight: 600, marginBottom: 12, color: '#e5e7eb' }}>👤 Cliente</p>
              <Row label="Nome" value={result.invoice.nomeCliente} accent="#60a5fa" />
              {result.invoice.cpf  && <Row label="CPF"  value={result.invoice.cpf} />}
              {result.invoice.cnpj && <Row label="CNPJ" value={result.invoice.cnpj} />}
              <Row label="UC" value={result.invoice.numeroUC} />
              <Row label="Referência" value={result.invoice.mesAnoReferencia} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 12 }}>
                <span style={{ color: '#9ca3af', fontSize: 14, flexShrink: 0 }}>Endereço</span>
                <span style={{ color: '#d1d5db', fontSize: 12, textAlign: 'right' }}>{result.invoice.endereco}</span>
              </div>
            </Card>

            {/* Cálculo */}
            <Card>
              <p style={{ fontWeight: 600, marginBottom: 12, color: '#e5e7eb' }}>🧮 Cálculo</p>
              <Row label="⚡ Consumo" value={`${result.invoice.consumoKwh} kWh × R$ ${result.invoice.tarifaComTributos.toFixed(6)}`} />
              <Row label="🧾 Valor bruto" value={`R$ ${brl(result.calculation.valorBruto)}`} />
              <Row label={`✂️ Desconto (${result.discountPercent}%)`} value={`− R$ ${brl(result.calculation.desconto)}`} accent="#4ade80" />
              <Row label="✅ Valor líquido" value={`R$ ${brl(result.calculation.valorLiquido)}`} />
              <Row label="💡 Ilum. pública" value={`+ R$ ${brl(result.calculation.iluminacaoPublica)}`} />
              <div style={{ borderTop: '2px solid #4b5563', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 17 }}>💰 Total a pagar</span>
                <span style={{ fontWeight: 700, fontSize: 17, color: '#facc15' }}>R$ {brl(result.calculation.totalAPagar)}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#93c5fd', fontSize: 14 }}>🏆 Economia acumulada</span>
                <span style={{ color: '#93c5fd', fontWeight: 600, fontSize: 14 }}>R$ {brl(result.calculation.economiaAcumulada)}</span>
              </div>
            </Card>

            {/* Cliente novo */}
            {!result.clienteExistente && step !== 'saved' && (
              <div style={{ background: 'rgba(28,20,7,0.85)', backdropFilter: 'blur(6px)', border: '1px solid #92400e', borderRadius: 12, padding: 20 }}>
                <p style={{ fontWeight: 600, color: '#fbbf24', marginBottom: 8 }}>🆕 Cliente não cadastrado</p>
                <p style={{ color: '#d97706', fontSize: 13, marginBottom: 16 }}>
                  UC <strong style={{ color: '#fcd34d' }}>{result.invoice.numeroUC}</strong> não existe na planilha.
                  Informe o saldo de economia retroativo.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ color: '#fbbf24', fontSize: 14 }}>Economia inicial (R$):</label>
                  <input
                    type="text" value={economiaInicial}
                    onChange={e => setEconomiaInicial(e.target.value)}
                    style={{ ...inputStyle, width: 120, textAlign: 'center', borderColor: '#92400e' }}
                    placeholder="0,00"
                  />
                </div>
              </div>
            )}

            {/* Botões ação */}
            {step !== 'saved' && (
              <div className="app-btn-row" style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={handleReset} style={btnSecondary}>↩️ Cancelar</button>
                <button type="button" onClick={handleSave} disabled={step === 'saving'} style={btnGreen(step === 'saving')}>
                  {step === 'saving' ? '⏳ Gravando...' : '💾 Gravar no Sheets'}
                </button>
              </div>
            )}

            {/* Sucesso */}
            {step === 'saved' && (
              <div style={{ background: 'rgba(5,46,22,0.85)', backdropFilter: 'blur(6px)', border: '1px solid #166534', borderRadius: 8, padding: 16, color: '#86efac', fontSize: 14, textAlign: 'center', fontWeight: 500 }}>
                ✅ Gravado com sucesso na planilha!
              </div>
            )}

            {/* WhatsApp */}
            {msgs && (
              <>
                <p style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: -8 }}>📱 Mensagens WhatsApp</p>

                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>Bloco 1 — Relatório</span>
                    <CopyButton text={msgs.bloco1} />
                  </div>
                  <pre className="app-pre" style={{ background: '#111827', borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#e5e7eb', margin: 0, fontFamily: 'inherit' }}>
                    {msgs.bloco1}
                  </pre>
                </Card>

                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>Bloco 2 — Chave PIX</span>
                    <CopyButton text={msgs.bloco2} />
                  </div>
                  <pre style={{ background: '#111827', borderRadius: 8, padding: 12, fontSize: 16, letterSpacing: 4, color: '#facc15', margin: 0, fontFamily: 'monospace' }}>
                    {msgs.bloco2}
                  </pre>
                </Card>

                <button type="button" onClick={handleReset}
                  style={{ ...btnSecondary, flex: 'none', width: '100%', padding: '12px 0' }}>
                  ↩️ Processar nova fatura
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
