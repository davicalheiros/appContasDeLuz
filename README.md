# ☀️ Solar MCZ — Sistema de Cobrança de Clientes

Aplicação web interna para processamento das faturas mensais de energia elétrica dos clientes de energia solar. A ferramenta lê o PDF da fatura da **Equatorial Alagoas**, calcula o valor com desconto e registra tudo automaticamente no **Google Sheets**, além de gerar as mensagens prontas para envio via WhatsApp.

---

## Como funciona

1. **Upload do PDF** — a fatura da Equatorial é enviada pela interface
2. **Extração automática** — o sistema lê os dados diretamente do PDF: nome do cliente, UC, consumo (kWh), tarifa, iluminação pública, endereço e CPF/CNPJ
3. **Cálculo com desconto** — aplica o percentual de desconto configurado sobre o consumo compensado, somando a iluminação pública ao final
4. **Revisão** — antes de salvar, é exibido um resumo completo com todos os valores
5. **Gravação no Sheets** — registra a fatura na aba do cliente dentro da planilha Google
6. **Mensagens WhatsApp** — gera automaticamente dois blocos prontos para copiar e enviar ao cliente: relatório de consumo e chave PIX para pagamento

---

## Funcionalidades

- Parser de PDF da Equatorial Alagoas (pessoas físicas e jurídicas)
- Cálculo automático com desconto configurável por fatura
- Validação de divergência entre o valor calculado e o valor no PDF
- Cadastro automático de novos clientes na planilha
- Prevenção de lançamentos duplicados
- Cálculo e exibição da economia acumulada por cliente
- Geração de mensagens formatadas para WhatsApp

---

## Tecnologias

- [Next.js](https://nextjs.org/) 16 + React 19 + TypeScript
- [pdfjs-dist](https://mozilla.github.io/pdf.js/) — extração de texto dos PDFs
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) — integração com Google Sheets
- Tailwind CSS

---

## Configuração

### Pré-requisitos

- Node.js 18+
- Conta Google com acesso à API do Google Sheets
- Planilha Google configurada (veja estrutura abaixo)

### Instalação

```bash
git clone https://github.com/davicalheiros/appContasDeLuz.git
cd appContasDeLuz
npm install
```

### Variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto com as seguintes variáveis:

```env
# Caminho para o arquivo de credenciais da conta de serviço Google
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=credentials/google-service-account.json

# ID da planilha Google Sheets (encontrado na URL da planilha)
GOOGLE_SPREADSHEET_ID=seu_spreadsheet_id_aqui

# Senha de acesso ao app (autenticação básica)
APP_PASSWORD=sua_senha_aqui

# Chave PIX para recebimento (CNPJ)
NEXT_PUBLIC_CNPJ_PIX=00000000000000

# Desconto padrão aplicado (em %)
NEXT_PUBLIC_DEFAULT_DISCOUNT=20
```

### Credenciais Google

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto e ative a **Google Sheets API**
3. Crie uma **conta de serviço** e baixe a chave JSON
4. Salve o arquivo em `credentials/google-service-account.json`
5. Compartilhe a planilha Google com o e-mail da conta de serviço

### Estrutura da planilha Google Sheets

A planilha deve ter uma aba chamada **Clientes** com as colunas:

| UC | Nome | CPF | CNPJ | Endereço | Economia Inicial |
|----|------|-----|------|----------|-----------------|

Para cada cliente, o sistema cria automaticamente uma aba com o nome do cliente contendo o histórico de faturas:

| Mês/Ano | Consumo (kWh) | Tarifa (R$/kWh) | Ilum. Pública | Valor Bruto | Desconto (R$) | Total Pago |
|---------|---------------|-----------------|---------------|-------------|---------------|------------|

### Rodando localmente

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## Licença

Uso interno. Todos os direitos reservados.
