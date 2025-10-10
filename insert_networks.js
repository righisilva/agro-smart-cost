// insert_networks.js

const Database = require("better-sqlite3");
const db = new Database("smartagro.db");

// Definição das redes
const networks = {
  ethereum: { name: "Ethereum", rpc: "https://eth.llamarpc.com", token: "ethereum" },
  bsc: { name: "BNB Chain", rpc: "https://bsc-dataseed.binance.org", token: "binancecoin" },
  polygon: { name: "Polygon", rpc: "https://polygon-rpc.com", token: "matic-network" },
  localhost: { name: "Local Hardhat", rpc: "http://127.0.0.1:8545", token: "ETH" }
};

// Transação para inserir redes de forma atômica
const insertNetworks = db.transaction(() => {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO networks (name, rpc, token)
    VALUES (@name, @rpc, @token)
  `);

  for (const key in networks) {
    const net = networks[key];
    stmt.run({ name: net.name, rpc: net.rpc, token: net.token });
  }
});

try {
  insertNetworks();
  console.log("✅ Redes inseridas com sucesso!");
} catch (err) {
  console.error("❌ Erro ao inserir redes:", err.message);
} finally {
  db.close();
}

