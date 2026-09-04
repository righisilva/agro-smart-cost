// db/pgPool.js
require("dotenv").config();
const { Pool } = require("pg");

// Pool único do Postgres (histórico de gas/preços).
// Antes, index.js e contractService.js criavam cada um o seu próprio Pool.
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

module.exports = pgPool;
