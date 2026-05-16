'use client';

import { useRef, useState } from 'react';

export default function TestParserPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  function handleClick() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      alert('⚠️ Selecione um PDF primeiro!');
      return;
    }
    processFile(file);
  }

  async function processFile(file: File) {
    setLoading(true);
    setOutput('⏳ Processando...');

    try {
      const data = new FormData();
      data.append('pdf', file);
      data.append('discount', '20');

      const res = await fetch('/api/process', { method: 'POST', body: data });
      const json = await res.json();

      // Remove rawText do output pra ficar legível
      if (json.invoice) delete json.invoice.rawText;

      setOutput(JSON.stringify(json, null, 2));
    } catch (err) {
      setOutput('ERRO: ' + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 32, fontFamily: 'monospace', fontSize: 14, maxWidth: 800 }}>
      <h1 style={{ marginBottom: 24 }}>🧪 Teste — Processamento Completo</h1>

      <input ref={fileRef} type="file" style={{ display: 'block', marginBottom: 16 }} />

      <button
        type="button"
        onClick={handleClick}
        style={{
          padding: '10px 24px',
          background: loading ? '#93c5fd' : '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        {loading ? '⏳ Processando...' : '🔍 Processar PDF'}
      </button>

      {output && output !== '⏳ Processando...' && (
        <pre style={{ marginTop: 24, background: '#f3f4f6', padding: 16, borderRadius: 8, overflow: 'auto', maxHeight: 600, whiteSpace: 'pre-wrap' }}>
          {output}
        </pre>
      )}
    </div>
  );
}
