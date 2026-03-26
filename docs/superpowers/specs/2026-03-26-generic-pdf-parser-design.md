# Design: Parser genérico de PDF para cotações PEPA

**Data:** 2026-03-26
**Status:** Aprovado

## Contexto

O sistema PEPA importa dois tipos de arquivo PDF para comparativo de cotações:

1. **Arquivo Flex (PEPA)**: pedido de compra gerado pelo sistema interno Flex. Formato único e consistente, mas gera PDF baseado em imagem (sem texto selecionável).
2. **Arquivo do fornecedor**: retorno do orçamento. Cada fornecedor gera no seu próprio sistema, com formato diferente. São ~250 fornecedores.

O sistema atual tem parsers hardcoded por fornecedor/formato (`parseCorFioRetornoOrcamentoPdfLines`, `parseSupplierQuotePdfLines`, `parseFlexOrderCellMode`, etc.) dentro de `pepa-store.ts` (1.833 linhas). Cada novo formato exige um novo parser no código. Isso não escala para 250 fornecedores.

## Objetivo

Substituir todos os parsers hardcoded por:
- Um **parser dedicado para Flex** (formato único)
- Um **parser heurístico genérico** que funciona com qualquer PDF de fornecedor
- **OCR gratuito** (Tesseract) para PDFs de imagem

## Fluxo de processamento

```
PDF recebido
    │
    ├─ Tem texto extraível? (pdf-parse)
    │   ├─ SIM → texto puro
    │   └─ NÃO → Tesseract OCR (tesseract.js) → texto puro
    │
    ├─ É arquivo Flex (PEPA)?
    │   └─ Parser Flex dedicado (parser-flex.ts)
    │
    └─ É arquivo de fornecedor?
        └─ Parser heurístico genérico (parser-generic.ts)
            1. Detecta cabeçalho da tabela
            2. Mapeia colunas por padrão/heurística
            3. Extrai linhas de dados
            4. Retorna itens estruturados
```

## Parser heurístico genérico (fornecedores)

### Etapa 1 — Detectar cabeçalho da tabela

Procura linhas que contenham 2+ palavras-chave de tabela comercial:

| Tipo de campo | Variações aceitas |
|---------------|-------------------|
| SKU/Código | "codigo", "cod", "ref", "ref.forn", "código fornecedor", "item", "seq" |
| Descrição | "descricao", "descr", "produto", "material", "itens", "descrição dos itens" |
| Quantidade | "qtd", "qtde", "qt.ped", "quant", "quantidade" |
| Unidade | "un", "und", "unid", "unidade" |
| Preço unitário | "vlr.unit", "preco unit", "valor unitario", "unit", "unitario", "preço" |
| Preço total | "vlr.prod", "valor total", "total", "vlr.total" |
| IPI | "ipi", "%ipi", "aliq" |

Quando encontra a linha de cabeçalho, sabe a ordem das colunas.

### Etapa 2 — Mapear colunas por heurística (fallback)

Se não achar cabeçalho explícito, identifica colunas por tipo de dado:

- Código alfanumérico curto (2-15 chars) → SKU
- Texto longo com letras → descrição
- Número inteiro ou com 1 decimal (1-99.999) → quantidade
- Sigla curta (2-4 chars: UN/RL/MT/KG/CX/PC) → unidade
- Número com 2-4 decimais → preço
- "0,00" no final → IPI

### Etapa 3 — Extrair linhas de dados

Cada linha após o cabeçalho que contenha pelo menos SKU + descrição + 1 número é um item.

### Campos extraídos (todos presentes no arquivo)

| Campo | Variações de nome |
|-------|-------------------|
| SKU / Código fornecedor | "codigo", "cod", "ref", "ref.forn", "código fornecedor", "item" |
| Descrição | "descricao", "produto", "material", "itens" |
| Quantidade | "qtd", "qtde", "qt.ped", "quant" |
| Unidade | "un", "und", "unid", "unidade" |
| Preço unitário | "vlr.unit", "preco unit", "valor unitario" |
| Preço total | "vlr.prod", "valor total", "total" |
| %IPI | "ipi", "%ipi", "aliq" |

Todos os campos estão presentes no arquivo do fornecedor. Se o parser não conseguir extrair, é problema do parser, não do arquivo.

## Tela de validação (já existe, não muda)

O sistema cruza os dados extraídos dos dois arquivos e apresenta na tela:

| SKU PEPA | SKU FORN. | ITEM | QTD PEDIDA | UNID. | FORNECEDOR | PREÇO FLEX | PREÇO COTADO | DIF. | TOTAL | STATUS |

Divergências são destacadas. O comprador usa os botões já existentes para aceitar ou ajustar cada divergência (aceitar descrição, ajustar valor, aceitar cotação, ajustar quantidade, etc.).

## Estrutura de arquivos

```
lib/
├── pepa-store.ts          (lógica de negócio, persistência — refatorado, sem parsers)
├── pdf/
│   ├── extract-text.ts    (pdf-parse + fallback Tesseract OCR)
│   ├── parser-flex.ts     (parser dedicado Flex/PEPA)
│   ├── parser-generic.ts  (parser heurístico genérico para qualquer fornecedor)
│   └── types.ts           (tipos: ExtractedItem, etc.)
```

### Mudanças no código existente

**Removidos de `pepa-store.ts`:**
- `parseCorFioRetornoOrcamentoPdfLines()` — substituído por parser-generic
- `parseSupplierQuotePdfLines()` — substituído por parser-generic
- `extractSupplierPostNcmData()` — substituído por parser-generic
- `parseFlexOrderCellMode()` — substituído por parser-flex com suporte a OCR
- `parseFlexOrderPdfLines()` — movido para parser-flex.ts
- `inferRequestedItemFromLine()` — substituído por parser-generic
- `inferSupplierQuoteRowFromLine()` — substituído por parser-generic
- Console.logs de debug (linhas 519-520)

**Removidos do projeto:**
- `app/api/pepa/debug-pdf/route.ts` — endpoint temporário
- `scripts/debug-pdf.mjs` — script temporário

**`pepa-store.ts` passa a chamar:**
- `extractText(file)` → retorna linhas de texto
- `parseFlexPdf(lines)` → retorna itens do pedido Flex
- `parseGenericSupplierPdf(lines)` → retorna itens da cotação do fornecedor

## Dependências

- `tesseract.js` — OCR gratuito, roda local em JavaScript, sem binário externo

## O que NÃO muda

- Tela de validação e cruzamento
- Botões de aceite/ajuste de divergências
- API de upload (`/api/pepa/upload`)
- Lógica de persistência e snapshot
- Fluxo de pedido final
