// routes/gasHistoryRoutes.js

const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.get("/", async (req, res) => {
  console.log("📦 Recebendo requisição:", req.query);
  
  try {
    const { network, period, gasUnits } = req.query;

    // Permitir múltiplas redes
    const networks = [];
    if (Array.isArray(req.query.network)) {
      networks.push(...req.query.network);
    } else if (req.query.network) {
      networks.push(req.query.network);
    }

    const units = Number(gasUnits) || 21000;

    let query = `
      SELECT 
        n.name AS network,
        g.timestamp,
        g.gas_gwei,
        g.price_brl,
        (g.gas_gwei * 1e-9 * g.price_brl * $1) AS gas_cost_brl
      FROM gas_history g
      JOIN networks n ON n.id = g.network_id
      WHERE 1=1
    `;

    const params = [units];
    let paramIndex = 2;

    // Filtro de rede
    if (networks.length > 0) {
      const placeholders = networks.map((_, i) => `$${paramIndex + i}`).join(', ');
      query += ` AND n.name IN (${placeholders})`;
      params.push(...networks);
      paramIndex += networks.length;
    }

    // Filtro de período
    if (period && period !== "all") {
      const intervals = {
        'day': '1 day',
        'week': '7 days',
        'month': '30 days'
      };
      
      if (intervals[period]) {
        query += ` AND g.timestamp >= NOW() - INTERVAL '${intervals[period]}'`;
      }
    }

    query += " ORDER BY g.timestamp ASC";

    console.log("🔍 Query:", query);
    console.log("📊 Parâmetros:", params);

    const { rows } = await pgPool.query(query, params);
    
    // Formatar resposta
    const formattedRows = rows.map(row => ({
      network: row.network,
      timestamp: new Date(row.timestamp).toISOString(),
      gas_gwei: parseFloat(row.gas_gwei),
      price_brl: parseFloat(row.price_brl),
      gas_cost_brl: parseFloat(row.gas_cost_brl)
    }));

    console.log(`✅ Retornando ${formattedRows.length} registros`);
    res.json(formattedRows);

  } catch (err) {
    console.error("❌ Erro ao buscar histórico:", err);
    res.status(500).json({ 
      error: "Erro ao buscar histórico de gas",
      details: err.message 
    });
  }
});

module.exports = router;