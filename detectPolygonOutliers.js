require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();

  try {
    console.log("📊 Calculando limites estatísticos (IQR)...");

    const statsQuery = `
      WITH quartiles AS (
        SELECT
          percentile_cont(0.25) WITHIN GROUP (ORDER BY gh.gas_gwei) AS q1,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY gh.gas_gwei) AS q3
        FROM gas_history gh
        JOIN networks n ON gh.network_id = n.id
        WHERE n.token = 'polygon-ecosystem-token'
      )
      SELECT
        q1,
        q3,
        (q3 - q1) AS iqr,
        q3 + 1.5 * (q3 - q1) AS upper_limit
      FROM quartiles;
    `;

    const statsRes = await client.query(statsQuery);
    const stats = statsRes.rows[0];

    console.log("\n📈 Estatísticas:");
    console.log("Q1:", Number(stats.q1).toFixed(2));
    console.log("Q3:", Number(stats.q3).toFixed(2));
    console.log("IQR:", Number(stats.iqr).toFixed(2));
    console.log("Limite superior (Q3 + 1.5*IQR):", Number(stats.upper_limit).toFixed(2));

    console.log("\n🔎 Buscando outliers...");

    const outliersQuery = `
      SELECT gh.id, gh.gas_gwei, gh.price_usd, gh.price_brl, gh.timestamp
      FROM gas_history gh
      JOIN networks n ON gh.network_id = n.id
      WHERE n.token = 'polygon-ecosystem-token'
      AND gh.gas_gwei > $1
      ORDER BY gh.gas_gwei DESC;
    `;

    const outliersRes = await client.query(outliersQuery, [stats.upper_limit]);

    console.log("\n🚨 Outliers encontrados:", outliersRes.rowCount);
    console.table(outliersRes.rows);

  } catch (err) {
    console.error("❌ Erro:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();