require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// ================= DB =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ================= CSV =================
const csvFilePath = path.resolve(__dirname, "scripts/cotacoes_blockchain2.csv");

// ================= NUMBER PARSER SEGURO =================
function parseSafeNumber(value) {
  if (!value) return null;

  value = value.trim();

  // remove \r invisível
  value = value.replace(/\r/g, "");

  // se tiver várias vírgulas, são milhares → remove todas
  const commas = (value.match(/,/g) || []).length;
  if (commas > 1) {
    value = value.replace(/,/g, "");
  }

  return parseFloat(value);
}

// ================= NETWORK UPSERT =================
async function getOrCreateNetworkId(name, token) {
  const result = await pool.query(
    `
    INSERT INTO networks (name, token)
    VALUES ($1, $2)
    ON CONFLICT (name)
    DO UPDATE SET token = EXCLUDED.token
    RETURNING id;
    `,
    [name.trim(), token.trim()]
  );

  return result.rows[0].id;
}

// ================= INSERT HISTÓRICO =================
async function insertGasHistory(networkId, timestamp, gasGwei, priceUsd, priceBrl) {
  await pool.query(
    `INSERT INTO gas_history
     (network_id, timestamp, gas_gwei, price_usd, price_brl)
     VALUES ($1, $2, $3, $4, $5)`,
    [networkId, timestamp, gasGwei, priceUsd, priceBrl]
  );
}

// ================= MAIN =================
async function main() {
  console.log("🚀 Iniciando importação...\n");

  const csv = fs.readFileSync(csvFilePath, "utf8");

  const lines = csv
    .split("\n")
    .slice(1)        // remove header
    .map(l => l.trim())
    .filter(Boolean);

  let count = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, ""); // remove \r

    const parts = line.split(",");

    // Proteção contra linha quebrada
    if (parts.length !== 6) {
      console.log("⚠️ Linha ignorada (formato inválido):", line);
      continue;
    }
    
    const [timestamp, rede, token, usd, brl, gas] = parts;

    const priceUsd = parseSafeNumber(usd);
    const priceBrl = parseSafeNumber(brl);
    const gasGwei  = parseSafeNumber(gas);

    if ([priceUsd, priceBrl, gasGwei].some(v => isNaN(v))) {
      console.log("⚠️ Linha com número inválido:", line);
      continue;
    }

    const networkId = await getOrCreateNetworkId(rede, token);

    await insertGasHistory(networkId, timestamp, gasGwei, priceUsd, priceBrl);

    count++;
  }

  await pool.end();
  console.log(`\n🎉 Importação concluída! ${count} registros inseridos.`);
}

main().catch(err => console.error("❌ Erro:", err));
