require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }
})

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teste_conexao (
        id SERIAL PRIMARY KEY,
        nome TEXT,
        criado_em TIMESTAMP DEFAULT NOW()
      );
    `)

    await pool.query(
      "INSERT INTO teste_conexao (nome) VALUES ($1)",
      ["Fábio está conectado 🚀"]
    )

    const res = await pool.query("SELECT * FROM teste_conexao")

    console.log("📦 Dados no banco:")
    console.table(res.rows)

  } catch (err) {
    console.error("❌ Erro:", err.message)
  } finally {
    await pool.end()
  }
}

run()
