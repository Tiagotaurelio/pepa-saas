const path = require("path");
const sharp = require("sharp");

const outputPath = path.join(__dirname, "..", "previews", "pepa-pedido-final-preview.png");

const rows = [
  ["00003.018", "Cabo FlexSil 750 V 2,50 Azul", "10.000", "Irimar", "R$ 1,7677", "R$ 17.677,00", "Pronto"],
  ["00003.018", "Cabo FlexSil 750 V 2,50 Preto", "8.000", "Irimar", "R$ 1,7677", "R$ 14.141,60", "Pronto"],
  ["00003.020", "Cabo FlexSil 750 V 6,00 Preto", "1.000", "Irimar", "R$ 4,3580", "R$ 4.358,00", "Pronto"],
  ["00003.021", "Cabo FlexSil 750 V 10,00 Azul", "1.000", "Irimar", "R$ 7,6450", "R$ 7.645,00", "Pendente"],
  ["00005.018", "Cordao Flex Paralelo 2,50 Preto", "500", "Irimar", "R$ 3,9283", "R$ 1.964,15", "Pronto"]
];

const svg = `
<svg width="1800" height="1480" viewBox="0 0 1800 1480" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1800" y2="1480" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F8FBFF"/>
      <stop offset="1" stop-color="#EEF4F8"/>
    </linearGradient>
    <linearGradient id="hero" x1="0" y1="0" x2="900" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#9A3412"/>
      <stop offset="1" stop-color="#F97316"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#0F172A" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="1800" height="1480" fill="url(#bg)"/>
  <circle cx="1500" cy="120" r="220" fill="#F97316" fill-opacity="0.06"/>
  <circle cx="120" cy="130" r="220" fill="#0B62A4" fill-opacity="0.05"/>

  <rect x="32" y="32" width="270" height="1416" rx="32" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="62" y="82" fill="#64748B" font-size="18" font-family="Arial" font-weight="700" letter-spacing="3">REACTIVE</text>
  <text x="56" y="122" fill="#172033" font-size="32" font-family="Arial" font-weight="700">Pedido Final</text>
  <text x="62" y="154" fill="#64748B" font-size="16" font-family="Arial">Exportacao do comprador</text>
  ${navItem(56, 250, "Cotacoes PEPA", false)}
  ${navItem(56, 316, "Validacao PEPA", false)}
  ${navItem(56, 382, "Pedido Final", true)}
  ${navItem(56, 448, "Relatorios", false)}
  ${sideBadge(56, 1310, "Conector: arquivo", "#FFEDD5", "#C2410C")}
  ${sideBadge(56, 1358, "1 item pendente", "#FEF3C7", "#B45309")}

  <rect x="322" y="32" width="1410" height="150" rx="32" fill="url(#hero)" filter="url(#shadow)"/>
  <text x="360" y="82" fill="#FED7AA" font-size="18" font-family="Arial" font-weight="700" letter-spacing="2.5">PEDIDO FINAL</text>
  <text x="360" y="126" fill="#FFFFFF" font-size="40" font-family="Arial" font-weight="700">Consolidado final pronto para exportacao</text>
  <text x="360" y="160" fill="#FFF1E8" font-size="19" font-family="Arial">A decisao aprovada vira um pacote final em arquivo, mantendo a mesma ordem do arquivo-base do Flex.</text>
  <rect x="1472" y="66" width="172" height="48" rx="24" fill="#FFFFFF"/>
  <text x="1512" y="96" fill="#C2410C" font-size="16" font-family="Arial" font-weight="700">Exportar pedido</text>

  ${metric(322, 212, "Pedido", "PC-PEPA-000184", "arquivo-base 4910PEPA-20409")}
  ${metric(688, 212, "Fornecedor", "Irimar", "21/28/35/42/49")}
  ${metric(1054, 212, "Total consolidado", "R$ 45.786", "5 itens")}
  ${metric(1384, 212, "Status", "Parcial", "1 item pendente")}

  <rect x="322" y="402" width="560" height="380" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="354" y="452" fill="#64748B" font-size="18" font-family="Arial">Pacote de exportacao</text>
  <text x="354" y="490" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Como o comprador fecha esse lote</text>
  ${connector(354, 540, "Exportacao XLSX", "Ativo", true)}
  ${connector(354, 636, "Revisao final", "Disponivel", false)}
  ${connector(354, 732, "Historico da rodada", "Disponivel", false)}

  <rect x="910" y="402" width="822" height="380" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="944" y="452" fill="#64748B" font-size="18" font-family="Arial">Cabecalho do pedido</text>
  <text x="944" y="490" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Pacote final para aprovacao e integracao</text>
  ${chip(1532, 458, 156, "Liberacao parcial", "#FEF3C7", "#B45309")}
  ${summary(944, 540, "Comprador", "Comprador PEPA")}
  ${summary(1342, 540, "Fornecedor", "Irimar")}
  ${summary(944, 652, "Pagamento", "21/28/35/42/49 dias")}
  ${summary(1342, 652, "Frete", "CIF, 3% da metragem")}

  <rect x="322" y="814" width="1410" height="602" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="354" y="864" fill="#64748B" font-size="18" font-family="Arial">Linhas exportaveis</text>
  <text x="354" y="902" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Grade final para exportacao do comprador</text>
  ${chip(1440, 870, 108, "Exportar XLSX", "#DBEAFE", "#0B62A4")}
  ${chip(1564, 870, 90, "Gerar JSON", "#F1F5F9", "#475569")}
  <rect x="354" y="942" width="1342" height="52" rx="16" fill="#F8FAFC"/>
  ${header(382, 974, ["SKU", "Descricao", "Qtd", "Fornecedor", "Preco", "Total", "Status"], [0, 170, 670, 820, 985, 1110, 1252])}
  ${rows.map((row, index) => tableRow(354, 1020 + index * 68, row)).join("")}
</svg>
`;

function navItem(x, y, label, active) {
  return `<rect x="${x}" y="${y}" width="190" height="48" rx="16" fill="${active ? "#C2410C" : "#FFFFFF"}"/><text x="${x + 16}" y="${y + 31}" fill="${active ? "#FFFFFF" : "#475569"}" font-size="18" font-family="Arial" font-weight="700">${label}</text>`;
}

function sideBadge(x, y, label, bg, fg) {
  return `<rect x="${x}" y="${y}" width="190" height="34" rx="14" fill="${bg}"/><text x="${x + 12}" y="${y + 22}" fill="${fg}" font-size="14" font-family="Arial" font-weight="700">${label}</text>`;
}

function metric(x, y, label, value, detail) {
  return `<rect x="${x}" y="${y}" width="340" height="150" rx="28" fill="#FFFFFF" filter="url(#shadow)"/><text x="${x + 28}" y="${y + 42}" fill="#64748B" font-size="17" font-family="Arial">${label}</text><text x="${x + 28}" y="${y + 90}" fill="#172033" font-size="34" font-family="Arial" font-weight="700">${value}</text><text x="${x + 28}" y="${y + 122}" fill="#C2410C" font-size="16" font-family="Arial" font-weight="700">${detail}</text>`;
}

function connector(x, y, title, status, active) {
  const fill = active ? "#EFF6FF" : "#FFFFFF";
  const stroke = active ? "#0B62A4" : "#E2E8F0";
  const bg = active ? "#DCFCE7" : "#F1F5F9";
  const fg = active ? "#166534" : "#64748B";
  return `<rect x="${x}" y="${y}" width="480" height="76" rx="22" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${x + 18}" y="${y + 29}" fill="#172033" font-size="19" font-family="Arial" font-weight="700">${title}</text><text x="${x + 18}" y="${y + 53}" fill="#475569" font-size="15" font-family="Arial">${active ? "gera o arquivo final na ordem do arquivo-base" : "apoio operacional ao fechamento do pedido"}</text><rect x="${x + 392}" y="${y + 16}" width="64" height="28" rx="14" fill="${bg}"/><text x="${x + 409}" y="${y + 34}" fill="${fg}" font-size="12" font-family="Arial" font-weight="700">${status}</text>`;
}

function summary(x, y, label, value) {
  return `<rect x="${x}" y="${y}" width="358" height="84" rx="22" fill="#F8FAFC"/><text x="${x + 20}" y="${y + 28}" fill="#64748B" font-size="14" font-family="Arial" font-weight="700" letter-spacing="1">${label}</text><text x="${x + 20}" y="${y + 56}" fill="#172033" font-size="20" font-family="Arial" font-weight="700">${value}</text>`;
}

function chip(x, y, width, label, bg, fg) {
  return `<rect x="${x}" y="${y}" width="${width}" height="38" rx="19" fill="${bg}"/><text x="${x + 16}" y="${y + 24}" fill="${fg}" font-size="15" font-family="Arial" font-weight="700">${label}</text>`;
}

function header(x, y, labels, offsets) {
  return labels.map((label, index) => `<text x="${x + offsets[index]}" y="${y}" fill="#64748B" font-size="14" font-family="Arial" font-weight="700" letter-spacing="1">${label}</text>`).join("");
}

function tableRow(x, y, row) {
  const pending = row[6] === "Pendente";
  const bg = pending ? "#FEF3C7" : "#DCFCE7";
  const fg = pending ? "#B45309" : "#15803D";
  return `<rect x="${x}" y="${y}" width="1342" height="56" rx="18" fill="#F8FAFC"/><text x="${x + 28}" y="${y + 35}" fill="#172033" font-size="17" font-family="Arial" font-weight="700">${row[0]}</text><text x="${x + 198}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[1]}</text><text x="${x + 698}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[2]}</text><text x="${x + 848}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[3]}</text><text x="${x + 1013}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[4]}</text><text x="${x + 1138}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[5]}</text><rect x="${x + 1242}" y="${y + 13}" width="80" height="28" rx="14" fill="${bg}"/><text x="${x + 1260}" y="${y + 31}" fill="${fg}" font-size="13" font-family="Arial" font-weight="700">${row[6]}</text>`;
}

sharp(Buffer.from(svg)).png().toFile(outputPath).then(() => console.log(outputPath)).catch((error) => {
  console.error(error);
  process.exit(1);
});
