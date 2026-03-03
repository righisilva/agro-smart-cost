require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();

  try {
    console.log("🔎 Buscando registros inválidos...");

    const selectQuery = `
      SELECT gh.*
      FROM gas_history gh
      JOIN networks n ON gh.network_id = n.id
      WHERE n.token = 'polygon-ecosystem-token'
      AND gh.gas_gwei < 1
      ORDER BY gh.timestamp;
    `;

    const res = await client.query(selectQuery);

    console.log(`📊 Registros encontrados: ${res.rowCount}`);
    console.table(res.rows);

    if (res.rowCount === 0) {
      console.log("✅ Nada para remover.");
      return;
    }

    // ---------- salvar log ----------
    const logFile = `deleted_polygon_gas_errors_${Date.now()}.json`;
    fs.writeFileSync(logFile, JSON.stringify(res.rows, null, 2));

    console.log(`💾 Backup salvo em: ${logFile}`);

    // ---------- confirmação manual ----------
    console.log("\n⚠️  ATENÇÃO: os registros serão removidos permanentemente.");
    console.log("Digite 'DELETE' para confirmar:");

    process.stdin.setEncoding("utf8");

    process.stdin.once("data", async (input) => {
      const confirm = input.trim();

      if (confirm !== "DELETE") {
        console.log("❌ Operação cancelada.");
        process.exit();
      }

      console.log("🗑️ Removendo registros...");

      await client.query("BEGIN");

      const deleteQuery = `
        DELETE FROM gas_history
        WHERE id = ANY($1::int[])
      `;

      const ids = res.rows.map(r => r.id);

      const delRes = await client.query(deleteQuery, [ids]);

      await client.query("COMMIT");

      console.log(`✅ Registros removidos: ${delRes.rowCount}`);
      console.log("🎉 Limpeza concluída.");
      process.exit();
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erro:", err);
    process.exit(1);
  } finally {
    client.release();
  }
}

run();