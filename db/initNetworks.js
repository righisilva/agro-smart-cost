// db/initNetworks.js
const networksJson = require("../networks.json");

// Garante que cada rede de networks.json existe na tabela `networks` e
// devolve um objeto { token: { id, ...dadosDaRede } } pronto para uso.
function initNetworks(db) {
    const networks = {};

    for (const [key, n] of Object.entries(networksJson)) {
        // 🔧 Normaliza RPC (funciona para rpc OU rpcs)
        const rpc = n.rpc || (Array.isArray(n.rpcs) ? n.rpcs[0] : null);

        if (!rpc) {
            console.warn(`⚠️ Rede ${n.name} sem RPC válido. Ignorando...`);
            continue;
        }

        const existing = db.prepare("SELECT id FROM networks WHERE name = ?").get(n.name);

        if (!existing) {
            const result = db
                .prepare("INSERT INTO networks (name, token, rpc) VALUES (?, ?, ?)")
                .run(n.name, n.token, rpc);

            networks[n.token] = { id: result.lastInsertRowid, ...n, rpc };
        } else {
            networks[n.token] = { id: existing.id, ...n, rpc };
        }
    }

    return networks;
}

module.exports = { initNetworks };
