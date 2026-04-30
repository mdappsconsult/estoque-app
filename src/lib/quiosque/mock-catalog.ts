/**
 * Dados mock do cardápio quiosque (sem Supabase).
 * Substituir por fetch quando o banco existir.
 */

export type MockOpcao = {
  id: string;
  nome: string;
  precoAdicionalCentavos: number;
  ordem: number;
};

export type MockGrupoComplemento = {
  id: string;
  titulo: string;
  descricao?: string;
  min: number;
  max: number;
  ordem: number;
  opcoes: MockOpcao[];
};

export type MockProdutoCardapio = {
  id: string;
  categoriaId: string;
  nome: string;
  descricaoCurta: string;
  descricao: string;
  precoCentavos: number;
  /** Path em public/ ou URL absoluta (quando configurar remotePatterns). */
  imagemSrc: string;
  ordem: number;
  destaque: boolean;
  grupos: MockGrupoComplemento[];
};

export type MockCategoria = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  produtos: MockProdutoCardapio[];
};

export type MockFreezer = {
  id: string;
  slug: string;
  nomeExibicao: string;
  localNome: string;
  percentualDono: number;
  categorias: MockCategoria[];
};

const MOCK_FREEZER: MockFreezer = {
  id: 'mf-demo-1',
  slug: 'demo-barra',
  nomeExibicao: 'Freezer Barra (demo)',
  localNome: 'Loja Barra',
  percentualDono: 18,
  categorias: [
    {
      id: 'cat-pers',
      nome: 'Personalizados Kim',
      ordem: 1,
      ativo: true,
      produtos: [
        {
          id: 'prod-choco',
          categoriaId: 'cat-pers',
          nome: 'Kim Chocotruffa',
          descricaoCurta: 'Açaí com creme Chocotrufa, Amendoim e Leite Condensado',
          descricao:
            'Açaí cremoso com cobertura sabor chocotrufa, amendoim crocante e leite condensado.',
          precoCentavos: 2350,
          imagemSrc: '/branding/acai-do-kim-logo.png',
          ordem: 1,
          destaque: true,
          grupos: [
            {
              id: 'g-tam',
              titulo: 'Escolha seu tamanho',
              descricao: 'Detalhes do grupo',
              min: 1,
              max: 1,
              ordem: 1,
              opcoes: [
                { id: 'o1', nome: 'Grande 473ml', precoAdicionalCentavos: 0, ordem: 1 },
                { id: 'o2', nome: 'Extra Grande 710ml', precoAdicionalCentavos: 500, ordem: 2 },
                { id: 'o3', nome: 'Mega grande 945ml', precoAdicionalCentavos: 900, ordem: 3 },
              ],
            },
            {
              id: 'g-comp',
              titulo: 'Complementos adicionais',
              descricao: 'Turbine ainda mais o seu açaí',
              min: 0,
              max: 8,
              ordem: 2,
              opcoes: [
                { id: 'c1', nome: 'Morango', precoAdicionalCentavos: 300, ordem: 1 },
                { id: 'c2', nome: 'Leite condensado', precoAdicionalCentavos: 200, ordem: 2 },
                { id: 'c3', nome: 'Granola', precoAdicionalCentavos: 250, ordem: 3 },
                { id: 'c4', nome: 'Calda chocolate', precoAdicionalCentavos: 150, ordem: 4 },
              ],
            },
          ],
        },
        {
          id: 'prod-trad',
          categoriaId: 'cat-pers',
          nome: 'Kim Tradicional',
          descricaoCurta: 'Açaí puro com banana e granola',
          descricao: 'Açaí tradicional com banana e granola.',
          precoCentavos: 1890,
          imagemSrc: '/branding/acai-do-kim-logo.png',
          ordem: 2,
          destaque: false,
          grupos: [],
        },
      ],
    },
    {
      id: 'cat-camadas',
      nome: 'Copo em camadas',
      ordem: 2,
      ativo: true,
      produtos: [
        {
          id: 'prod-camada-1',
          categoriaId: 'cat-camadas',
          nome: 'Kim Camada Nutella',
          descricaoCurta: 'Camadas de açaí e Nutella',
          descricao: 'Copo em camadas alternando açaí e creme de avelã.',
          precoCentavos: 2690,
          imagemSrc: '/branding/acai-do-kim-logo.png',
          ordem: 1,
          destaque: false,
          grupos: [
            {
              id: 'g1',
              titulo: 'Tamanho',
              min: 1,
              max: 1,
              ordem: 1,
              opcoes: [
                { id: 't1', nome: 'Médio', precoAdicionalCentavos: 0, ordem: 1 },
                { id: 't2', nome: 'Grande', precoAdicionalCentavos: 400, ordem: 2 },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export function getMockFreezerBySlug(slug: string): MockFreezer | null {
  if (slug === MOCK_FREEZER.slug) return MOCK_FREEZER;
  return null;
}

export function listMockFreezersResumo(): Pick<MockFreezer, 'id' | 'slug' | 'nomeExibicao' | 'localNome'>[] {
  return [
    {
      id: MOCK_FREEZER.id,
      slug: MOCK_FREEZER.slug,
      nomeExibicao: MOCK_FREEZER.nomeExibicao,
      localNome: MOCK_FREEZER.localNome,
    },
  ];
}

export function formatBrlFromCentavos(centavos: number): string {
  const v = centavos / 100;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function findProduto(freezer: MockFreezer, itemId: string): MockProdutoCardapio | null {
  for (const cat of freezer.categorias) {
    const p = cat.produtos.find((x) => x.id === itemId);
    if (p) return p;
  }
  return null;
}

/** Para telas admin de edição (mock único freezer). */
export function findProdutoAdmin(
  itemId: string,
): { freezer: MockFreezer; produto: MockProdutoCardapio } | null {
  const f = MOCK_FREEZER;
  const produto = findProduto(f, itemId);
  if (!produto) return null;
  return { freezer: f, produto };
}
