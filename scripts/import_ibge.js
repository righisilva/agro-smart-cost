const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const csvParser = require("csv-parser");

const db = new Database("smartagro.db");
const csvFile = path.resolve(__dirname, "ibge_classificacao3.csv");

const insertIbge = db.prepare(`
  INSERT INTO ibge_dados (
    regiao_id,
    produto_id,
    estabelecimentos,
    valor_vendas,
    familiar
  )
  VALUES (?, ?, ?, ?, ?)
`);

const getProduto = db.prepare(`
  SELECT p.id
  FROM produtos p
  JOIN subclassificacoes_ibge s ON s.id = p.subclassificacao_id
  JOIN classificacoes_ibge c ON c.id = s.classificacao_id
  WHERE p.nome = ? AND c.nome = ?
`);

const getRegiao = db.prepare(`
  SELECT id FROM regioes WHERE nome = ?
`);

fs.createReadStream(csvFile)
  .pipe(csvParser())
  .on("data", (row) => {
    const produtoNome = row["Produtos"]?.trim();
    const classificacaoNome = row["Classificacao"]?.trim();

    if (!produtoNome || !classificacaoNome) {
      console.warn("⚠️ Linha ignorada (produto ou classificação vazios)");
      return;
    }

    const produtoRow = getProduto.get(produtoNome, classificacaoNome);

    if (!produtoRow) {
      console.warn(
        `⚠️ Produto não encontrado: "${produtoNome}" / "${classificacaoNome}"`
      );
      return;
    }

    const regioes = ["Brasil", "Sul", "RS", "Alegrete"];

    regioes.forEach((reg) => {
      const regRow = getRegiao.get(reg);
      if (!regRow) return;

      // -------- TOTAL --------
      const estabTotal =
        Number(row[`${reg} Total`]?.replace(/[^\d]/g, "")) || null;

      const valorTotal =
        Number(
          row[`${reg} Valor Vendido Total`]?.replace(/[^\d]/g, "")
        ) || null;

      insertIbge.run(
        regRow.id,
        produtoRow.id,
        estabTotal,
        valorTotal,
        0
      );

      // -------- FAMILIAR --------
      const estabFam =
        Number(row[`${reg} Familiar`]?.replace(/[^\d]/g, "")) || null;

      const valorFam =
        Number(
          row[`${reg} Valor Vendido Familiar`]?.replace(/[^\d]/g, "")
        ) || null;

      insertIbge.run(
        regRow.id,
        produtoRow.id,
        estabFam,
        valorFam,
        1
      );
    });

    console.log(`✅ IBGE inserido: ${produtoNome} / ${classificacaoNome}`);
  })
  .on("end", () => {
    console.log("🎉 Importação de dados IBGE concluída com sucesso!");
  })
  .on("error", (err) => {
    console.error("❌ Erro ao processar CSV:", err.message);
  });
