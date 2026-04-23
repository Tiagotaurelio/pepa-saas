# PEPA SaaS — Proposta de Implantação
**Documento para apresentação ao cliente**
Data: Abril de 2026

---

## O que é o PEPA SaaS

O PEPA é uma plataforma de cotação inteligente que automatiza o processo de comparação de preços entre fornecedores. Utilizando Inteligência Artificial, o sistema lê os PDFs de tabelas de preços enviados pelos fornecedores, extrai os dados automaticamente e monta uma tabela comparativa para que a equipe de compras tome a melhor decisão de compra.

**Benefícios principais:**
- Elimina digitação manual de preços
- Reduz erros de leitura e transcrição
- Agiliza o processo de cotação
- Gera trilha de auditoria de todas as decisões de compra
- Permite que múltiplos usuários trabalhem simultaneamente

---

## 1. Infraestrutura de Hospedagem

Como o cliente já possui servidor próprio, não há necessidade de contratar um servidor externo (VPS). O PEPA será instalado diretamente na máquina do cliente.

**Requisitos mínimos do servidor:**

| Requisito | Especificação |
|-----------|--------------|
| Sistema Operacional | Ubuntu 22.04 LTS ou superior (Linux) |
| Memória RAM | Mínimo 2GB (recomendado 4GB) |
| Espaço em disco | Mínimo 20GB livres |
| Docker | Instalado e configurado |
| Acesso à internet | Necessário para comunicação com banco de dados e IA |
| IP fixo | Necessário para vincular ao domínio da empresa |

> Se o servidor do cliente já estiver em funcionamento com outras aplicações, verificaremos a compatibilidade antes da instalação para não interferir nos sistemas existentes.

---

## 2. Domínio

O cliente precisará de um endereço web próprio para acessar o sistema (ex: `compras.empresacliente.com.br`).

- Pode ser um subdomínio de um domínio que o cliente já possua (sem custo adicional)
- Caso não possua domínio, o registro custa entre **R$40 e R$80/ano**
- Configuraremos o certificado SSL (cadeado de segurança) sem custo adicional

---

## 3. Banco de Dados

O PEPA utiliza o **Supabase** como banco de dados (PostgreSQL).

- O cliente terá um projeto próprio no Supabase, independente de outros clientes
- **Plano gratuito** atende bem o volume inicial (até 500MB de dados e 50.000 usuários ativos/mês)
- Caso o volume cresça, o plano pago custa a partir de **US$25/mês (~R$125/mês)**
- Todos os dados ficam armazenados com segurança na nuvem com backup automático

---

## 4. Automação com N8N

O N8N é a ferramenta responsável por monitorar os PDFs dos fornecedores e enviá-los automaticamente para o sistema. O cliente precisará de uma conta própria.

**Opções disponíveis:**

| Opção | Descrição | Custo |
|-------|-----------|-------|
| N8N Cloud | Conta na plataforma n8n.io, mais simples de manter | A partir de US$20/mês (~R$100/mês) |
| N8N Self-hosted | Instalado no próprio servidor do cliente | Gratuito |

**O fluxo de automação já está pronto** — será exportado e importado na conta do cliente em poucos minutos, sem necessidade de recriar do zero. Apenas as credenciais (Google Drive, OpenAI) serão atualizadas para as do cliente.

---

## 5. Inteligência Artificial (OpenAI)

A extração automática de dados dos PDFs dos fornecedores é feita pelo modelo **GPT-4o** da OpenAI. O cliente precisará de uma conta própria na OpenAI com saldo ativo.

**Como funciona a cobrança:**
- A OpenAI cobra por uso — o cliente paga somente pelo que utilizar
- Não há mensalidade fixa
- Custo estimado por PDF processado: **R$0,05 a R$0,20** dependendo do tamanho do arquivo

**Estimativa mensal de custo:**

| Volume de cotações/mês | Custo estimado OpenAI |
|------------------------|----------------------|
| Até 50 PDFs | R$3 a R$10 |
| 50 a 200 PDFs | R$10 a R$40 |
| Acima de 200 PDFs | R$40 a R$80 |

**Processo de configuração:**
1. Cliente cria conta em platform.openai.com
2. Cliente adiciona crédito (recomendamos começar com US$10)
3. Cliente gera uma chave de API (API Key)
4. Configuramos a chave no sistema — pronto

---

## 6. Integração com ERP

Caso o cliente deseje futuramente integrar o PEPA com o ERP utilizado na empresa, isso é totalmente viável. O PEPA já possui uma arquitetura de APIs REST preparada para integrações.

**O que pode ser integrado:**
- Importação automática de itens e pedidos do ERP para o PEPA
- Exportação das cotações aprovadas diretamente para o ERP
- Sincronização de cadastro de fornecedores e produtos

**Como proceder:**
Para desenvolver a integração, precisaremos saber:
- Qual ERP o cliente utiliza (TOTVS, SAP, Omie, Bling, etc.)
- Se o ERP possui API própria ou trabalha com exportação de arquivos
- Quais dados precisam ser trocados entre os sistemas

O desenvolvimento da integração será orçado separadamente conforme o escopo definido.

---

## 7. Resumo — Plataformas necessárias

| Plataforma | Finalidade | Custo estimado |
|-----------|-----------|----------------|
| Servidor próprio do cliente | Hospedagem do sistema | Já disponível |
| Domínio (subdomínio) | Endereço web de acesso | Gratuito (se já possui domínio) |
| GitHub | Repositório do código para atualizações | Gratuito |
| Supabase | Banco de dados | Gratuito (plano inicial) |
| N8N | Automação de leitura dos PDFs | R$0 a R$100/mês |
| OpenAI | Extração de dados via IA | R$3 a R$80/mês (conforme uso) |

**Custo operacional estimado total: R$3 a R$180/mês** (dependendo do volume de uso e da opção de N8N escolhida)

---

## 8. Etapas de Implantação

Abaixo o passo a passo de tudo que será feito para entregar o sistema funcionando no ambiente do cliente:

**Etapa 1 — Preparação do servidor**
- Verificar requisitos do servidor do cliente
- Instalar Docker caso não esteja instalado
- Configurar domínio e SSL

**Etapa 2 — Instalação do PEPA**
- Configurar o ambiente no servidor do cliente
- Realizar a migração do banco de dados
- Configurar variáveis de ambiente (segredos, tokens)
- Testar o sistema no novo ambiente

**Etapa 3 — Configuração das integrações**
- Criar conta N8N do cliente (ou instalar no servidor)
- Importar o fluxo de automação já pronto
- Criar conta OpenAI do cliente e configurar API Key
- Conectar Google Drive do cliente ao fluxo N8N
- Testar o fluxo completo (PDF → IA → PEPA)

**Etapa 4 — Cadastro de usuários**
- Cadastrar todos os usuários da equipe de compras
- Definir permissões (admin / comprador)
- Realizar treinamento com a equipe

**Etapa 5 — Validação e entrega**
- Processar cotações reais para validação
- Confirmar que todos os fluxos estão funcionando
- Entregar documentação de uso para a equipe
- Definir canal de suporte pós-implantação

---

## 9. Suporte pós-implantação

Após a entrega, recomenda-se um período de suporte acompanhado para garantir que a equipe do cliente utilize o sistema com segurança. Esse suporte pode ser contratado separadamente conforme a necessidade do cliente.

---

*Documento elaborado por Maravai Inteligência Empresarial*
*Criciúma-SC — contato: anderson@maravai.com.br*
