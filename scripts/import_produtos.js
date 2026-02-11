const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const csvParser = require("csv-parser");

const db = new Database("smartagro.db");
const csvFile = path.resolve(__dirname, "produtos.csv");

// Insert preparado
const insertProduto = db.prepare(`
  INSERT INTO produtos (nome, subclassificacao_id, rastreabilidade_obrigatoria)
  VALUES (?, ?, ?)
`);

fs.createReadStream(csvFile)
  .pipe(csvParser({
    mapHeaders: ({ header }) => header.trim(),
    mapValues: ({ value }) => value?.trim()
  }))
  .on("data", (row) => {
    const {
      nome,
      classificacao,
      subclassificacao,
      rastreabilidade_obrigatoria
    } = row;

    if (!nome || !classificacao || !subclassificacao) {
      console.warn(`⚠️ Linha inválida, ignorando: ${JSON.stringify(row)}`);
      return;
    }

    // 1️⃣ Busca classificação
    const classificacaoRow = db.prepare(`
      SELECT id FROM classificacoes_ibge WHERE nome = ?
    `).get(classificacao);

    if (!classificacaoRow) {
      console.warn(`⚠️ Classificação "${classificacao}" não encontrada`);
      return;
    }

    // 2️⃣ Busca subcategoria PELO PAR (classificação + nome)
    const subclassificacaoRow = db.prepare(`
      SELECT id FROM subclassificacoes_ibge
      WHERE nome = ? AND classificacao_id = ?
    `).get(subclassificacao, classificacaoRow.id);

    if (!subclassificacaoRow) {
      console.warn(
        `⚠️ Subclassificação "${subclassificacao}" não encontrada em "${classificacao}"`
      );
      return;
    }

    // 3️⃣ Normaliza rastreabilidade
    const rastreabilidade =
      rastreabilidade_obrigatoria &&
      rastreabilidade_obrigatoria.toUpperCase() === "TRUE"
        ? 1
        : 0;

    // 4️⃣ Evita duplicação (produto + subcategoria)
    const existente = db.prepare(`
      SELECT id FROM produtos
      WHERE nome = ? AND subclassificacao_id = ?
    `).get(nome, subclassificacaoRow.id);

    if (existente) {
      console.log(
        `⚠️ Produto "${nome}" já existe em "${classificacao} > ${subclassificacao}", ignorando`
      );
      return;
    }

    // 5️⃣ Insere
    insertProduto.run(
      nome,
      subclassificacaoRow.id,
      rastreabilidade
    );

    console.log(
      `✅ Produto "${nome}" inserido em ${classificacao} > ${subclassificacao}`
    );
  })
  .on("end", () => {
    console.log("🎉 Importação de produtos concluída!");
  })
  .on("error", (err) => {
    console.error("❌ Erro ao processar o CSV:", err.message);
  });
