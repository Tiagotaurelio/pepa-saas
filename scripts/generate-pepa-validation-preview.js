const path = require("path");
const sharp = require("sharp");

const outputPath = path.join(__dirname, "..", "previews", "pepa-validacao-preview.png");

const rows = [
  ["00003.018", "Cabo FlexSil 750 V 2,50 Azul", "10.000", "Irimar", "R$ 1,7677", "R$ 17.677,00", "Aprovado"],
  ["00003.018", "Cabo FlexSil 750 V 2,50 Preto", "8.000", "Irimar", "R$ 1,7677", "R$ 14.141,60", "Aprovado"],
  ["00003.020", "Cabo FlexSil 750 V 6,00 Preto", "1.000", "Irimar", "R$ 4,3580", "R$ 4.358,00", "Aprovado"],
  ["00003.021", "Cabo FlexSil 750 V 10,00 Azul", "1.000", "Irimar", "R$ 7,6450", "R$ 7.645,00", "Pendente"],
  ["00005.018", "Cordao Flex Paralelo 2,50 Preto", "500", "Irimar", "R$ 3,9283", "R$ 1.964,15", "Aprovado"]
];

const svg = `
<svg width="1800" height="1480" viewBox="0 0 1800 1480" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1800" y2="1480" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F8FBFF"/>
      <stop offset="1" stop-color="#EEF4F8"/>
    </linearGradient>
    <linearGradient id="hero" x1="0" y1="0" x2="900" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#166534"/>
      <stop offset="1" stop-color="#22C55E"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#0F172A" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="1800" height="1480" fill="url(#bg)"/>
  <circle cx="1490" cy="110" r="220" fill="#22C55E" fill-opacity="0.05"/>
  <circle cx="110" cy="140" r="220" fill="#0B62A4" fill-opacity="0.05"/>

  <rect x="32" y="32" width="270" height="1416" rx="32" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="62" y="82" fill="#64748B" font-size="18" font-family="Arial" font-weight="700" letter-spacing="3">REACTIVE</text>
  <text x="54" y="122" fill="#172033" font-size="31" font-family="Arial" font-weight="700">Validacao PEPA</text>
  <text x="62" y="154" fill="#64748B" font-size="16" font-family="Arial">Antes do pedido final</text>
  ${navItem(56, 250, "Cotacoes PEPA", false)}
  ${navItem(56, 316, "Validacao PEPA", true)}
  ${navItem(56, 382, "Pedido Final", false)}
  ${navItem(56, 448, "Relatorios", false)}
  ${sideBadge(56, 1310, "1 item em revisao", "#FEF3C7", "#B45309")}
  ${sideBadge(56, 1358, "Pedido bloqueado", "#DCFCE7", "#166534")}

  <rect x="322" y="32" width="1410" height="150" rx="32" fill="url(#hero)" filter="url(#shadow)"/>
  <text x="360" y="82" fill="#DCFCE7" font-size="18" font-family="Arial" font-weight="700" letter-spacing="2.5">VALIDACAO PEPA</text>
  <text x="360" y="126" fill="#FFFFFF" font-size="40" font-family="Arial" font-weight="700">Etapa final antes da montagem do pedido</text>
  <text x="360" y="160" fill="#EAFBF0" font-size="19" font-family="Arial">O comprador revisa excecoes, confirma disponibilidade e decide o que pode seguir para o pedido final.</text>
  <rect x="1478" y="66" width="170" height="48" rx="24" fill="#FFFFFF"/>
  <text x="1519" y="96" fill="#166534" font-size="16" font-family="Arial" font-weight="700">Liberar pedido</text>

  ${metric(322, 212, "Itens selecionados", "5", "prontos")}
  ${metric(688, 212, "Fornecedores", "1", "fechamento")}
  ${metric(1054, 212, "Itens em revisao", "1", "checagem final")}
  ${metric(1384, 212, "Valor do pedido", "R$ 45.786", "pre-compra")}

  <rect x="322" y="402" width="560" height="360" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="354" y="452" fill="#64748B" font-size="18" font-family="Arial">Checklist</text>
  <text x="354" y="490" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Validacoes do comprador</text>
  ${alert(354, 540, "1 item exige confirmacao final", "SKU 00003.021 depende de disponibilidade.", "#FEF3C7", "#B45309", "Atencao")}
  ${alert(354, 636, "Compra concentrada em 1 fornecedor", "Piloto fechado na Irimar para simplificar frete.", "#DBEAFE", "#0B62A4", "Info")}
  <text x="354" y="728" fill="#475569" font-size="17" font-family="Arial">1. confirmar disponibilidade</text>
  <text x="354" y="754" fill="#475569" font-size="17" font-family="Arial">2. validar prazo, frete e pagamento</text>

  <rect x="910" y="402" width="822" height="360" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="944" y="452" fill="#64748B" font-size="18" font-family="Arial">Fechamento por fornecedor</text>
  <text x="944" y="490" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Resumo comercial antes do pedido</text>
  ${chip(1580, 458, 108, "Pre-pedido", "#DCFCE7", "#166534")}
  <rect x="944" y="544" width="784" height="136" rx="24" fill="#F8FAFC"/>
  <text x="972" y="584" fill="#172033" font-size="28" font-family="Arial" font-weight="700">Irimar</text>
  <text x="972" y="620" fill="#475569" font-size="17" font-family="Arial">Itens: 5  •  Pagamento: 21/28/35/42/49  •  Frete: CIF, 3% da metragem</text>
  <rect x="1540" y="558" width="156" height="36" rx="18" fill="#FFFFFF"/>
  <text x="1574" y="582" fill="#166534" font-size="16" font-family="Arial" font-weight="700">R$ 45.785,75</text>

  <rect x="322" y="794" width="1410" height="622" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <text x="354" y="844" fill="#64748B" font-size="18" font-family="Arial">Selecao final por item</text>
  <text x="354" y="882" fill="#172033" font-size="30" font-family="Arial" font-weight="700">Grade de validacao antes de gerar o pedido</text>
  ${chip(1478, 850, 176, "Pedido nao liberado", "#FEF3C7", "#B45309")}
  <rect x="354" y="922" width="1342" height="52" rx="16" fill="#F8FAFC"/>
  ${header(382, 954, ["SKU", "Descricao", "Qtd", "Fornecedor", "Preco", "Total", "Revisao"], [0, 170, 670, 820, 985, 1110, 1252])}
  ${rows.map((row, index) => tableRow(354, 1000 + index * 68, row)).join("")}
</svg>
`;

function navItem(x, y, label, active) {
  return `<rect x="${x}" y="${y}" width="190" height="48" rx="16" fill="${active ? "#166534" : "#FFFFFF"}"/><text x="${x + 16}" y="${y + 31}" fill="${active ? "#FFFFFF" : "#475569"}" font-size="18" font-family="Arial" font-weight="700">${label}</text>`;
}

function sideBadge(x, y, label, bg, fg) {
  return `<rect x="${x}" y="${y}" width="190" height="34" rx="14" fill="${bg}"/><text x="${x + 12}" y="${y + 22}" fill="${fg}" font-size="14" font-family="Arial" font-weight="700">${label}</text>`;
}

function metric(x, y, label, value, detail) {
  return `<rect x="${x}" y="${y}" width="340" height="150" rx="28" fill="#FFFFFF" filter="url(#shadow)"/><text x="${x + 28}" y="${y + 42}" fill="#64748B" font-size="17" font-family="Arial">${label}</text><text x="${x + 28}" y="${y + 90}" fill="#172033" font-size="34" font-family="Arial" font-weight="700">${value}</text><text x="${x + 28}" y="${y + 122}" fill="#166534" font-size="17" font-family="Arial" font-weight="700">${detail}</text>`;
}

function alert(x, y, title, desc, bg, fg, badge) {
  return `<rect x="${x}" y="${y}" width="480" height="76" rx="22" fill="${bg}"/><text x="${x + 18}" y="${y + 29}" fill="#172033" font-size="18" font-family="Arial" font-weight="700">${title}</text><text x="${x + 18}" y="${y + 53}" fill="#475569" font-size="15" font-family="Arial">${desc}</text><rect x="${x + 392}" y="${y + 16}" width="64" height="28" rx="14" fill="#FFFFFF"/><text x="${x + 413}" y="${y + 34}" fill="${fg}" font-size="12" font-family="Arial" font-weight="700">${badge}</text>`;
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
  return `<rect x="${x}" y="${y}" width="1342" height="56" rx="18" fill="#F8FAFC"/><text x="${x + 28}" y="${y + 35}" fill="#172033" font-size="17" font-family="Arial" font-weight="700">${row[0]}</text><text x="${x + 198}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[1]}</text><text x="${x + 698}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[2]}</text><text x="${x + 848}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[3]}</text><text x="${x + 1013}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[4]}</text><text x="${x + 1138}" y="${y + 35}" fill="#334155" font-size="17" font-family="Arial">${row[5]}</text><rect x="${x + 1242}" y="${y + 13}" width="80" height="28" rx="14" fill="${bg}"/><text x="${x + 1257}" y="${y + 31}" fill="${fg}" font-size="13" font-family="Arial" font-weight="700">${row[6]}</text>`;
}

sharp(Buffer.from(svg)).png().toFile(outputPath).then(() => console.log(outputPath)).catch((error) => {
  console.error(error);
  process.exit(1);
});
