// services/gasPriceService.js
const { ethers } = require("ethers");
const pgPool = require("../db/pgPool");
const networks = require("../networks.json");

const INTERVALS = {
    day: "1 day",
    week: "7 days",
    month: "30 days",
};

async function getHistoricalGasPrices(tipoCalculo = "last") {
    console.log("⛽ Usando gas histórico:", tipoCalculo);

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
                    g.gas_gwei
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
                    AVG(g.gas_gwei) AS gas_gwei
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
            if (!row.gas_gwei) return;

            const gasPriceWei = ethers.utils.parseUnits(Number(row.gas_gwei).toFixed(9), "gwei");

            resultado[row.token] = {
                name: row.name,
                gasPrice: gasPriceWei,
                token: row.token,
            };
        });

        return resultado;
    } catch (err) {
        console.error("⚠️ Erro ao buscar gas histórico:", err.message);
        return {};
    }
}

async function getLiveGasPricesFromNetworks() {
    const gasPrices = {};
    console.log("⛽ Obtendo gas prices das redes...");

    for (const [key, net] of Object.entries(networks)) {
        if (key === "localhost") continue;

        const rpcList = net.rpcs || (net.rpc ? [net.rpc] : []);
        if (!rpcList.length) {
            console.warn(`⚠️ Nenhum RPC definido para ${net.name}`);
            continue;
        }

        let gasPrice = null;
        for (const rpc of rpcList) {
            try {
                const provider = new ethers.providers.JsonRpcProvider({ url: rpc, timeout: 5000 });
                const network = await provider.getNetwork();
                if (key === "polygon" && network.chainId !== 137) {
                    console.warn(`⚠️ RPC ${rpc} não é Polygon`);
                    continue;
                }

                const candidatePrice = await provider.getGasPrice();
                const gwei = parseFloat(ethers.utils.formatUnits(candidatePrice, "gwei"));

                // Nota: no código original, quando essa checagem falhava o `gasPrice`
                // ficava com o valor inválido da rodada anterior e passava direto
                // no `if (!gasPrice)` mais abaixo. Aqui garantimos que só um valor
                // realmente válido sai do loop.
                if (key === "polygon" && gwei < 1) {
                    console.warn(`⚠️ Gas anormal para Polygon: ${gwei}`);
                    continue;
                }

                gasPrice = candidatePrice;
                break;
            } catch (e) {
                console.warn(`⚠️ RPC ${rpc} falhou para ${net.name}`);
            }
        }

        if (!gasPrice) {
            console.warn(`⚠️ Nenhum RPC válido para ${net.name}`);
            continue;
        }

        gasPrices[net.token] = { name: net.name, gasPrice, token: net.token };
        console.log(
            `✅ Gas price para ${net.name} (${net.token}): ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`
        );
    }

    return gasPrices;
}

async function getGasPricesFromNetworks(periodo = "last") {
    if (periodo === "current") {
        return await getLiveGasPricesFromNetworks();
    }
    return await getHistoricalGasPrices(periodo);
}

module.exports = { getGasPricesFromNetworks, getHistoricalGasPrices, getLiveGasPricesFromNetworks };
