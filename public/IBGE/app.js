let graficoVendas, graficoEstabelecimentos;

async function atualizarDashboard() {
    const regiao = document.getElementById("filtroRegiao").value;
    const classificacao = document.getElementById("filtroClassificacao").value;
    const familiar = document.getElementById("filtroFamiliar").value;
    const obrigatorio = document.getElementById("filtroObrigatorio").value;
    const top = document.getElementById("filtroTop").value; // NOVO
    const orderBy = document.getElementById("filtroOrderBy").value;


    const params = new URLSearchParams();
    if (regiao) params.append("regiao", regiao);
    if (classificacao) params.append("classificacao", classificacao);
    if (familiar) params.append("familiar", familiar);
    if (obrigatorio) params.append("obrigatorio", obrigatorio);
    if (top) params.append("top", top); // NOVO
    if (orderBy) params.append("orderBy", orderBy); // 'valor_vendas' ou 'estabelecimentos'



    const res = await fetch("/api/ibge?" + params.toString());
    const dados = await res.json();

    const vendasPorProduto = {};
    const estabPorProduto = {};

    dados.forEach(d => {
        vendasPorProduto[d.produto] = (vendasPorProduto[d.produto] || 0) + (d.valor_vendas || 0);
        estabPorProduto[d.produto] = (estabPorProduto[d.produto] || 0) + (d.estabelecimentos || 0);
    });

    criarGrafico("graficoVendas", "Vendas por Produto", vendasPorProduto, graficoVendas);
    criarGrafico("graficoEstabelecimentos", "Estabelecimentos por Produto", estabPorProduto, graficoEstabelecimentos);
}

function criarGrafico(canvasId, titulo, dados, graficoExistente) {
    const ctx = document.getElementById(canvasId).getContext("2d");

    const config = {
        type: "bar",
        data: {
            labels: Object.keys(dados),
            datasets: [{
                label: titulo,
                data: Object.values(dados),
                backgroundColor: "rgba(54, 162, 235, 0.6)"
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                title: { display: true, text: titulo }
            }
        }
    };

    if (graficoExistente) {
        graficoExistente.destroy();
    }

    if (canvasId === "graficoVendas") graficoVendas = new Chart(ctx, config);
    if (canvasId === "graficoEstabelecimentos") graficoEstabelecimentos = new Chart(ctx, config);
}

// Carrega inicialmente sem filtros
atualizarDashboard();

