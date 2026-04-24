export type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};

export const navigation: NavItem[] = [
  { href: "/super-admin", label: "Empresas", superAdminOnly: true },
  { href: "/painel-performance", label: "Painel Performance", adminOnly: true },
  { href: "/cotacoes-pepa", label: "Cotacoes" },
  { href: "/validacao-compra-pepa", label: "Validacao de Compra" },
  { href: "/pedido-final-pepa", label: "Pedido Final" },
  { href: "/logs-pepa", label: "Auditoria" },
  { href: "/configuracoes", label: "Configuracoes" }
];
