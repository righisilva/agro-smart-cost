require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const query = `
    SELECT 
      gh.id,
      gh.timestamp,
      gh.gas_gwei,
      gh.price_usd,
      gh.price_brl
    FROM gas_history gh
    JOIN networks n ON gh.network_id = n.id
    WHERE n.token = 'polygon-ecosystem-token'
      AND gh.gas_gwei < 1
    ORDER BY gh.timestamp DESC
  `;

  const res = await pool.query(query);

  console.log("Registros encontrados:", res.rowCount);
  console.table(res.rows);

  await pool.end();
}

run().catch(console.error);