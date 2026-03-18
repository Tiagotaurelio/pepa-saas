const path = require("path");
const sharp = require("sharp");

const outputPath = path.join(__dirname, "..", "previews", "pepa-cotacoes-preview.png");

const rows = [
  ["00003.018", "Cabo FlexSil 750 V 2,50 Azul", "10.000", "Irimar", "R$ 1,7677", "R$ 17.677,00", "Cotado"],
  ["00003.018", "Cabo FlexSil 750 V 2,50 Preto", "8.000", "Irimar", "R$ 1,7677", "R$ 14.141,60", "Cotado"],
  ["00003.020", "Cabo FlexSil 750 V 6,00 Preto", "1.000", "Irimar", "R$ 4,3580", "R$ 4.358,00", "Cotado"],
  ["00003.021", "Cabo FlexSil 750 V 10,00 Azul", "1.000", "Irimar", "R$ 7,6450", "R$ 7.645,00", "Cotado"],
  ["00005.018", "Cordao Flex Paralelo 2,50 Preto", "500", "Irimar", "R$ 3,9283", "R$ 1.964,15", "Cotado"]
];

const svg = `
<svg width="1800" height="1500" viewBox="0 0 1800 1500" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1800" y2="1500" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F8FBFF"/>
      <stop offset="1" stop-color="#EEF4F8"/>
    </linearGradient>
    <linearGradient id="hero" x1="0" y1="0" x2="900" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B62A4"/>
      <stop offset="1" stop-color="#1690CE"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#0F172A" flood-opacity="0.08"/>
    </filter>
  </defs>

  <rect width="1800" height="1500" fill="url(#bg)"/>
  <circle cx="1450" cy="100" r="220" fill="#16A34A" fill-opacity="0.05"/>
  <circle cx="120" cy="140" r="220" fill="#0B62A4" fill-opacity="0.05"/>

  <rect x="32" y="32" width="270" height="1436" rx="32" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="62" y="82" fill="#64748B" font-size="18" font-family="Arial" font-weight="700" letter-spacing="3">REACTIVE</text>
  <text x="56" y="122" fill="#172033" font-size="32" font-family="Arial" font-weight="700">Cotacoes PEPA</text>
  <text x="62" y="154" fill="#64748B" font-size="16" font-family="Arial">Leitura e comparacao</text>
  ${navItem(56, 250, "Dashboard", false)}
  ${navItem(56, 316, "Cotacoes PEPA", true)}
  ${navItem(56, 382, "Validacao PEPA", false)}
  ${navItem(56, 448, "Pedido Final", false)}
  ${sideBadge(56, 1330, "Operacao piloto", "#E0F2FE", "#0B62A4")}
  ${sideBadge(56, 1378, "2 PDFs em OCR", "#FEF3C7", "#B45309")}

  <rect x="322" y="32" width="1410" height="150" rx="32" fill="url(#hero)" filter="url(#shadow)"/>
  <text x="360" y="82" fill="#CFE7FB" font-size="18" font-family="Arial" font-weight="700" letter-spacing="2.5">COTACOES PEPA</text>
  <text x="360" y="126" fill="#FFFFFF" font-size="40" font-family="Arial" font-weight="700">Comparativo automatico de fornecedores</text>
  <text x="360" y="160" fill="#E8F4FD" font-size="19" font-family="Arial">Entrada do espelho do Flex, leitura dos retornos em PDF e comparativo item a item para o comprador decidir.</text>
  <rect x="1468" y="66" width="174" height="48" rx="24" fill="#FFFFFF"/>
  <text x="1516" y="96" fill="#0B62A4" font-size="16" font-family="Arial" font-weight="700">Nova coleta</text>

  ${metric(322, 212, "Arquivos recebidos", "4", "1 lido sem OCR")}
  ${metric(688, 212, "Fila OCR", "2", "PDFs escaneados")}
  ${metric(1054, 212, "Itens comparaveis", "12/12", "piloto inicial")}
  ${metric(1384, 212, "Valor lido", "R$ 57.952", "base Irimar")}

  <rect x="322" y="402" width="620" height="418" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="354" y="452" fill="#64748B" font-size="18" font-family="Arial">Pipeline</text>
  <text x="354" y="490" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Estado dos anexos</text>
  ${statusRow(354, 540, "Espelho Flex", "Orcamento_4910PEPA-20409.pdf", "Parser", "#E2E8F0", "#475569")}
  ${statusRow(354, 635, "Irimar", "PDF com texto lido", "Lido", "#DCFCE7", "#15803D")}
  ${statusRow(354, 730, "20409 / 2113", "Fila OCR para tabela", "OCR", "#FEF3C7", "#B45309")}

  <rect x="956" y="402" width="776" height="418" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="1004" y="452" fill="#64748B" font-size="18" font-family="Arial">Ranking por fornecedor</text>
  <text x="1004" y="490" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Quem entrou no comparativo</text>
  ${supplierRow(1004, 546, "Irimar", "12 itens", "R$ 57.952", "21/28/35/42/49", "CIF", true)}
  ${supplierRow(1004, 650, "Fornecedor 20409", "0 item", "pendente", "nao lido", "nao lido", false)}
  ${supplierRow(1004, 754, "Fornecedor 2113", "0 item", "pendente", "nao lido", "nao lido", false)}

  <rect x="322" y="852" width="1410" height="584" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="354" y="902" fill="#64748B" font-size="18" font-family="Arial">Mapa comparativo</text>
  <text x="354" y="940" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Itens consolidados para decisao do comprador</text>
  <text x="354" y="972" fill="#64748B" font-size="17" font-family="Arial">A proxima etapa do fluxo e a validacao final antes da montagem do pedido.</text>
  ${chip(1482, 910, 208, "Proxima etapa: validacao", "#FEF3C7", "#B45309")}
  <rect x="354" y="1010" width="1342" height="52" rx="16" fill="#F8FAFC"/>
  ${header(382, 1042, ["SKU", "Descricao", "Qtd", "Fornecedor", "Preco", "Total", "Status"], [0, 170, 670, 820, 985, 1110, 1258])}
  ${rows.map((row, index) => tableRow(354, 1088 + index * 68, row)).join("")}
</svg>
`;

function navItem(x, y, label, active) {
  return `<rect x="${x}" y="${y}" width="190" height="48" rx="16" fill="${active ? "#0B62A4" : "#FFFFFF"}"/><text x="${x + 16}" y="${y + 31}" fill="${active ? "#FFFFFF" : "#475569"}" font-size="18" font-family="Arial" font-weight="700">${label}</text>`;
}

function sideBadge(x, y, label, bg, fg) {
  return `<rect x="${x}" y="${y}" width="190" height="34" rx="14" fill="${bg}"/><text x="${x + 12}" y="${y + 22}" fill="${fg}" font-size="14" font-family="Arial" font-weight="700">${label}</text>`;
}

function metric(x, y, label, value, detail) {
  return `<rect x="${x}" y="${y}" width="340" height="150" rx="28" fill="#FFFFFF" filter="url(#shadow)"/><text x="${x + 28}" y="${y + 42}" fill="#64748B" font-size="17" font-family="Arial">${label}</text><text x="${x + 28}" y="${y + 90}" fill="#172033" font-size="34" font-family="Arial" font-weight="700">${value}</text><text x="${x + 28}" y="${y + 122}" fill="#0B62A4" font-size="17" font-family="Arial" font-weight="700">${detail}</text>`;
}

function statusRow(x, y, title, subtitle, badge, bg, fg) {
  return `<rect x="${x}" y="${y}" width="540" height="74" rx="22" fill="#F8FAFC"/><text x="${x + 20}" y="${y + 30}" fill="#172033" font-size="22" font-family="Arial" font-weight="700">${title}</text><text x="${x + 20}" y="${y + 54}" fill="#64748B" font-size="16" font-family="Arial">${subtitle}</text><rect x="${x + 390}" y="${y + 18}" width="128" height="30" rx="14" fill="${bg}"/><text x="${x + 424}" y="${y + 38}" fill="${fg}" font-size="13" font-family="Arial" font-weight="700">${badge}</text>`;
}

function supplierRow(x, y, supplier, coverage, total, payment, freight, parsed) {
  const bg = parsed ? "#DCFCE7" : "#FEF3C7";
  const fg = parsed ? "#15803D" : "#B45309";
  const label = parsed ? "Lido" : "OCR";
  return `<rect x="${x}" y="${y}" width="688" height="78" rx="22" fill="#F8FAFC"/><text x="${x + 20}" y="${y + 30}" fill="#172033" font-size="22" font-family="Arial" font-weight="700">${supplier}</text><text x="${x + 20}" y="${y + 56}" fill="#475569" font-size="16" font-family="Arial">${coverage}  •  ${total}  •  ${payment}  •  ${freight}</text><rect x="${x + 584}" y="${y + 18}" width="82" height="30" rx="14" fill="${bg}"/><text x="${x + 611}" y="${y + 38}" fill="${fg}" font-size="14" font-family="Arial" font-weight="700">${label}</text>`;
}

function chip(x, y, width, label, bg, fg) {
  return `<rect x="${x}" y="${y}" width="${width}" height="38" rx="19" fill="${bg}"/><text x="${x + 16}" y="${y + 24}" fill="${fg}" font-size="15" font-family="Arial" font-weight="700">${label}</text>`;
}

function header(x, y, labels, offsets) {
  return labels.map((label, index) => `<text x="${x + offsets[index]}" y="${y}" fill="#64748B" font-size="14" font-family="Arial" font-weight="700" letter-spacing="1">${label}</text>`).join("");
}

function tableRow(x, y, row) {
  return `<rect x="${x}" y="${y}" width="1342" height="56" rx="18" fill="#F8FAFC"/><text x="${x + 28}" y="${y + 35}" fill="#172033" font-size="17" font-family="Arial" font-weight="700">${row[0]}</text><text x="${x + 198}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[1]}</text><text x="${x + 698}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[2]}</text><text x="${x + 848}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[3]}</text><text x="${x + 1013}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[4]}</text><text x="${x + 1138}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[5]}</text><rect x="${x + 1242}" y="${y + 13}" width="80" height="28" rx="14" fill="#DCFCE7"/><text x="${x + 1261}" y="${y + 31}" fill="#15803D" font-size="13" font-family="Arial" font-weight="700">${row[6]}</text>`;
}

sharp(Buffer.from(svg)).png().toFile(outputPath).then(() => console.log(outputPath)).catch((error) => {
  console.error(error);
  process.exit(1);
});
