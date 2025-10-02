const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const csvParser = require("csv-parser");

const db = new Database("smartagro.db");
const csvFile = path.resolve(__dirname, "produtos.csv"); // altere se tiver outro arquivo

const insertProduto = db.prepare(`
  INSERT INTO produtos (nome, classificacao_id)
  VALUES (?, ?)
`);

// Lê CSV e insere no banco
fs.createReadStream(csvFile)
  .pipe(csvParser({
      mapHeaders: ({ header }) => header.trim(),
      mapValues: ({ value }) => value.trim()
  }))
  .on("data", (row) => {
    const { nome, classificacao } = row;

    if (!nome || !classificacao) {
        console.warn(`⚠️ Linha inválida, ignorando: ${JSON.stringify(row)}`);
        return;
    }

    const classificacaoId = db.prepare("SELECT id FROM classificacoes_ibge WHERE nome = ?").get(classificacao)?.id;
    if (!classificacaoId) {
      console.warn(`⚠️ Classificação "${classificacao}" não encontrada para o produto "${nome}"`);
      return;
    }

    // Verifica se a combinação produto + classificação já existe
    const produtoExistente = db.prepare(`
      SELECT id FROM produtos 
      WHERE nome = ? AND classificacao_id = ?
    `).get(nome, classificacaoId);

    if (produtoExistente) {
        console.log(`⚠️ Produto "${nome}" com classificação "${classificacao}" já existe, ignorando...`);
        return;
    }

    insertProduto.run(nome, classificacaoId);
    console.log(`✅ Produto "${nome}" inserido com classificação "${classificacao}"`);
  })
  .on("end", () => {
    console.log("🎉 Importação de produtos concluída!");
  })
  .on("error", (err) => {
    console.error("❌ Erro ao ler o CSV:", err.message);
  });

