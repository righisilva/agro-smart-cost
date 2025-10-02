// setup_db.js
const Database = require("better-sqlite3");

// Cria ou abre o banco
const db = new Database("smartagro.db");

// Apaga tabelas antigas (opcional, para resetar)
db.exec(`
DROP TABLE IF EXISTS custos_contrato;
DROP TABLE IF EXISTS ibge_dados;
DROP TABLE IF EXISTS produtos;
DROP TABLE IF EXISTS regioes;
DROP TABLE IF EXISTS classificacoes_ibge;
`);

// Cria tabelas de apoio
db.exec(`
CREATE TABLE classificacoes_ibge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL
);

CREATE TABLE regioes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT CHECK(tipo IN ('Pais', 'Regiao', 'Estado', 'Municipio')) NOT NULL
);

CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    classificacao_id INTEGER NOT NULL,
    FOREIGN KEY (classificacao_id) REFERENCES classificacoes_ibge(id)
);
`);

// Cria tabelas principais
db.exec(`
CREATE TABLE ibge_dados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regiao_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    estabelecimentos INTEGER,
    valor_vendas REAL,
    familiar BOOLEAN NOT NULL DEFAULT 0,
    obrigatorio BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (regiao_id) REFERENCES regioes(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE TABLE custos_contrato (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    rede TEXT NOT NULL,
    token TEXT NOT NULL,
    funcao TEXT NOT NULL,
    gas INTEGER NOT NULL,
    gasPrice REAL NOT NULL,
    custoToken REAL NOT NULL,
    usd REAL NOT NULL,
    brl REAL NOT NULL
);
`);

// Popula classificações IBGE
const classificacoes = [
  "Agricultura",
  "Pecuária",
  "Silvicultura",
  "Extração Vegetal",
  "Aquicultura",
  "Agroindústria"
];
const insertClassificacao = db.prepare("INSERT INTO classificacoes_ibge (nome) VALUES (?)");
classificacoes.forEach(c => insertClassificacao.run(c));

// Popula regiões
const regioes = [
  { nome: "Brasil", tipo: "Pais" },
  { nome: "Sul", tipo: "Regiao" },
  { nome: "RS", tipo: "Estado" },
  { nome: "Alegrete", tipo: "Municipio" }
];
const insertRegiao = db.prepare("INSERT INTO regioes (nome, tipo) VALUES (?, ?)");
regioes.forEach(r => insertRegiao.run(r.nome, r.tipo));


console.log("✅ Banco smartagro.db criado e populado com sucesso!");

