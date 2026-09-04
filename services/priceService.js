// services/priceService.js
const axios = require("axios");
const pgPool = require("../db/pgPool");
const networks = require("../networks.json");

const INTERVALS = {
    day: "1 day",
    week: "7 days",
    month: "30 days",
};

async function getHistoricalTokenPrices(tipoCalculo = "last") {
    console.log("📊 Usando preços históricos:", tipoCalculo);

    try {
        const redesValidas = Object.values(networks)
            .filter((net) => net.name !== "Local Hardhat")
            .map((net) => net.token);

        if (redesValidas.length === 0) return {};

        const placeholders = redesValidas.map((_, i) => `$${i + 1}`).join(", ");
        let query;

        if (tipoCalculo === "last") {
            query = `
                SELECT DISTINCT ON (n.token)
                    n.name,
                    n.token,
                    g.price_usd AS avg_price_usd,
                    g.price_brl AS avg_price_brl
                FROM gas_history g
                JOIN networks n ON n.id = g.network_id
                WHERE n.token IN (${placeholders})
                ORDER BY n.token, g.timestamp DESC, g.id DESC
            `;
        } else {
            query = `
                SELECT
                    n.name,
                    n.token,
                    AVG(g.price_usd) AS avg_price_usd,
                    AVG(g.price_brl) AS avg_price_brl
                FROM gas_history g
                JOIN networks n ON n.id = g.network_id
                WHERE n.token IN (${placeholders})
            `;

            if (INTERVALS[tipoCalculo]) {
                query += ` AND g.timestamp >= NOW() - INTERVAL '${INTERVALS[tipoCalculo]}'`;
            }

            query += ` GROUP BY n.name, n.token`;
        }

        const { rows } = await pgPool.query(query, redesValidas);

        const resultado = {};
        rows.forEach((row) => {
            resultado[row.token] = {
                usd: Number(row.avg_price_usd) || 0,
                brl: Number(row.avg_price_brl) || 0,
            };
        });

        return resultado;
    } catch (err) {
        console.error("⚠️ Erro ao buscar preços históricos:", err.message);
        return {};
    }
}

async function getLiveTokenPrices() {
    const ids = [
        ...new Set(
            Object.values(networks)
                .map((net) => net.token)
                .filter((token) => typeof token === "string" && token.length > 0)
        ),
    ].join(",");

    if (!ids) {
        console.warn("⚠️ Nenhum token válido encontrado");
        return {};
    }

    console.log("📡 Buscando preços para:", ids);

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,brl`;

    try {
        const res = await axios.get(url);
        return res.data;
    } catch (err) {
        console.error("❌ Erro ao buscar preços:", err.message);
        return {};
    }
}

async function getTokenPrices(periodo = "last") {
    if (periodo === "current") {
        return await getLiveTokenPrices();
    }
    return await getHistoricalTokenPrices(periodo);
}

module.exports = { getTokenPrices, getHistoricalTokenPrices, getLiveTokenPrices };
