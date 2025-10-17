// --- Preencher selects com dados do DB ---
async function carregarFiltros() {
  const endpoints = {
    filtroContrato: "/api/contracts-list",
    filtroRede: "/api/networks-list",
    filtroFuncao: "/api/functions-list",
  };

  for (const [id, url] of Object.entries(endpoints)) {
    const select = document.getElementById(id);
    try {
      const res = await fetch(url);
      const items = await res.json();
      items.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item;
        opt.textContent = item;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error(`Erro ao carregar ${id}:`, err);
    }
  }
}

// Carregar ao abrir a página
window.addEventListener("DOMContentLoaded", carregarFiltros);


async function carregarResultados() {
  const params = new URLSearchParams({
    regiao: document.getElementById("filtroRegiao").value,
    classificacao: document.getElementById("filtroClassificacao").value,
    familiar: document.getElementById("filtroFamiliar").value,
    obrigatorio: document.getElementById("filtroObrigatorio").value,
    contract: document.getElementById("filtroContrato").value,
    network: document.getElementById("filtroRede").value,
    functionName: document.getElementById("filtroFuncao").value,
    top: document.getElementById("filtroTop").value,
    orderBy: document.getElementById("filtroOrderBy").value,
  });

  const res = await fetch(`/api/results?${params}`);
  const data = await res.json();

  preencherTabela(data);
  desenharGrafico(data);
}

function preencherTabela(dados) {
  const tbody = document.querySelector("#tabelaResultados tbody");
  tbody.innerHTML = "";
  dados.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.produto}</td>
      <td>${d.regiao}</td>
      <td>${d.classificacao}</td>
      <td>${d.familiar ? "Sim" : "Não"}</td>
      <td>${d.obrigatorio ? "Sim" : "Não"}</td>
      <td>${d.custo_medio_contrato_brl}</td>
      <td><b>${d.total_estimado_brl}</b></td>
    `;
    tbody.appendChild(tr);
  });
}

let grafico;
function desenharGrafico(dados) {
  const ctx = document.getElementById("graficoResultados").getContext("2d");
  if (grafico) grafico.destroy();
  grafico = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dados.map(d => d.produto),
      datasets: [{
        label: "Total Estimado (BRL)",
        data: dados.map(d => d.total_estimado_brl),
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top" },
        title: { display: true, text: "Estimativa de Valor Total (Produto × Custo Contrato)" }
      }
    }
  });
}

