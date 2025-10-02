const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const csvParser = require("csv-parser");

const db = new Database("smartagro.db");
const csvFile = path.resolve(__dirname, "ibge_classificacao.csv");

const insertIbge = db.prepare(`
  INSERT INTO ibge_dados (regiao_id, produto_id, estabelecimentos, valor_vendas, familiar, obrigatorio)
  VALUES (?, ?, ?, ?, ?, ?)
`);

fs.createReadStream(csvFile)
  .pipe(csvParser())
  .on("data", (row) => {
    const produtoNome = row["Produtos"].trim();
    const classificacaoNome = row["Classificacao"].trim();

    // Busca produto pelo nome e classificação
    const produtoRow = db.prepare(`
      SELECT p.id FROM produtos p
      JOIN classificacoes_ibge c ON p.classificacao_id = c.id
      WHERE p.nome = ? AND c.nome = ?
    `).get(produtoNome, classificacaoNome);

    if (!produtoRow) {
      console.warn(`⚠️ Produto "${produtoNome}" com classificação "${classificacaoNome}" não encontrado`);
      return;
    }

    // Regiões
    const regioes = ["Brasil", "Sul", "RS", "Alegrete"];
    const obrigatorio = row["Obrigatorio"] ? Number(row["Obrigatorio"]) : 0;

    regioes.forEach((reg) => {
      // Total
      const estabTotal = Number(row[`${reg} Total`].replace(/[^\d]/g,'')) || null;
      const valorTotal = Number(row[`${reg} Valor Vendido Total`].replace(/[^\d]/g,'')) || null;

      const regId = db.prepare(`SELECT id FROM regioes WHERE nome = ?`).get(reg).id;
      insertIbge.run(regId, produtoRow.id, estabTotal, valorTotal, 0, obrigatorio);

      // Familiar
      const estabFam = Number(row[`${reg} Familiar`].replace(/[^\d]/g,'')) || null;
      const valorFam = Number(row[`${reg} Valor Vendido Familiar`].replace(/[^\d]/g,'')) || null;

      insertIbge.run(regId, produtoRow.id, estabFam, valorFam, 1, obrigatorio);
    });

    console.log(`✅ Inserido dados IBGE para produto: ${produtoNome} / ${classificacaoNome}`);
  })
  .on("end", () => {
    console.log("🎉 Importação de dados IBGE concluída!");
  })
  .on("error", (err) => {
    console.error("❌ Erro ao ler CSV:", err.message);
  });

