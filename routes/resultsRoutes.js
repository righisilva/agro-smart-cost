// routes/resultsRoutes.js

const express = require("express");

module.exports = (db) => {
  const router = express.Router();


const { Pool } = require("pg");

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

  // --- Endpoint combinado: IBGE + Custos de Contrato ---
  router.get("/", async (req, res) => {
    try {
      const {
        regiao,
        classificacao,
        subclassificacao,
        familiar,
        obrigatorio,
        top,
        orderBy,
        contract,
        network,
        functionName,
        tipo_calculo,
      } = req.query;

      console.log("🔧 Tipo de cálculo selecionado:", tipo_calculo);
      console.log("🔧 Subclassificação:", subclassificacao);

      // ---------------- IBGE ----------------
      let queryIBGE = `
        SELECT
        i.id,
        r.nome AS regiao,
        p.nome AS produto,
        c.nome AS classificacao,
        s.nome AS subclassificacao,
        i.estabelecimentos,
        i.valor_vendas,
        i.familiar,
        p.rastreabilidade_obrigatoria AS obrigatorio
      FROM ibge_dados i
      JOIN produtos p ON i.produto_id = p.id
      LEFT JOIN subclassificacoes_ibge s 
            ON p.subclassificacao_id = s.id
      LEFT JOIN classificacoes_ibge c 
            ON s.classificacao_id = c.id
      JOIN regioes r ON i.regiao_id = r.id
      WHERE 1=1
      
      `;
      const paramsIBGE = {};

      if (regiao) { queryIBGE += " AND r.nome = @regiao"; paramsIBGE.regiao = regiao; }
      if (classificacao) { queryIBGE += " AND c.nome = @classificacao"; paramsIBGE.classificacao = classificacao; }
      if (subclassificacao && subclassificacao !== "undefined") {
        queryIBGE += " AND s.nome = @subclassificacao";
        paramsIBGE.subclassificacao = subclassificacao;
      }      
      if (familiar !== undefined) { queryIBGE += " AND i.familiar = @familiar"; paramsIBGE.familiar = Number(familiar); }
      if (obrigatorio !== undefined) { queryIBGE += " AND p.rastreabilidade_obrigatoria = @obrigatorio"; paramsIBGE.obrigatorio = Number(obrigatorio); }

      const dadosIBGE = db.prepare(queryIBGE).all(paramsIBGE);
      if (!dadosIBGE.length) return res.json([]);

      // ---------------- CONTRATOS ----------------
      let queryContratos = `
        SELECT
          c.id AS contract_id,
          c.name AS contract_name,
          f.name AS function_name,
          n.name AS network,
          d.gas_used,
          d.cost_usd,
          d.cost_brl
        FROM contracts c
        JOIN contract_functions f ON f.contract_id = c.id
        JOIN contract_function_costs d ON d.function_id = f.id
        JOIN networks n ON n.id = d.network_id
        WHERE 1=1
      `;
      const paramsContratos = {};

      if (contract) { queryContratos += " AND c.name LIKE @contract"; paramsContratos.contract = `%${contract}%`; }
      if (network) { queryContratos += " AND n.name LIKE @network"; paramsContratos.network = `%${network}%`; }
      if (functionName) { queryContratos += " AND f.name LIKE @functionName"; paramsContratos.functionName = `%${functionName}%`; }

      const dadosContratos = db.prepare(queryContratos).all(paramsContratos);
      if (!dadosContratos.length) return res.json([]);

      

      const gasTotal = dadosContratos.reduce((acc, d) => acc + (d.gas_used || 0), 0);
      let custoContratoBRL;
      if (tipo_calculo === 'ultima') {
        
        custoContratoBRL = dadosContratos.reduce((acc, d) => acc + (d.cost_brl || 0), 0);
      } else {

        console.log("📊 Usando MÉDIA histórica de gas:", tipo_calculo);
      
        const redes = [...new Set(dadosContratos.map(d => d.network))];
        if (redes.length === 0) custoContratoBRL = 0;
        else {
      
          const intervals = {
            day: "1 day",
            week: "7 days",
            month: "30 days"
          };
      
          const placeholders = redes.map((_, i) => `$${i + 1}`).join(", ");
          let queryGas = `
            SELECT AVG(g.gas_gwei * 1e-9 * g.price_brl) AS avg_cost_per_gas
            FROM gas_history g
            JOIN networks n ON n.id = g.network_id
            WHERE n.name IN (${placeholders})
          `;
      
          // aplicar filtro de período se não for "all"
          if (intervals[tipo_calculo]) {
            queryGas += ` AND g.timestamp >= NOW() - INTERVAL '${intervals[tipo_calculo]}'`;
          }
      
          const { rows } = await pgPool.query(queryGas, redes);
          const custoMedioPorGas = Number(rows[0]?.avg_cost_per_gas) || 0;
      
          custoContratoBRL = gasTotal * custoMedioPorGas;
        }
      }

      console.log(`Custo Total BRL: ${custoContratoBRL}, Gas Total: ${gasTotal}`);

      // ---------------- AGREGAÇÃO ----------------
      const agregados = {};

      dadosIBGE.forEach(d => {
        const estabelecimentos = Number(d.estabelecimentos) || 0;
        const chave = `${d.produto} | ${d.classificacao}`;

        if (!agregados[chave]) {
          agregados[chave] = {
            produto: d.produto,
            classificacao: d.classificacao,
            regiao: d.regiao,
            familiar: d.familiar,
            obrigatorio: d.obrigatorio,
            estabelecimentos: 0,
            total_estimado_brl: 0,
            valor_vendas: d.valor_vendas
          };
        }

        agregados[chave].estabelecimentos += estabelecimentos;
        agregados[chave].total_estimado_brl += estabelecimentos * custoContratoBRL;
      });

      const resultado = Object.values(agregados).map(d => {
        const totalEstimado = d.total_estimado_brl;
        const valorVendas = (Number(d.valor_vendas) || 0) * 1000;
        const percentual = valorVendas > 0 ? Number(((totalEstimado / valorVendas) * 100).toFixed(2)) : 0;

        return {
          produto: d.produto,
          regiao: d.regiao,
          classificacao: d.classificacao,
          familiar: d.familiar,
          obrigatorio: d.obrigatorio,
          estabelecimentos: d.estabelecimentos,
          valor_vendas: valorVendas,
          total_estimado_brl: Number(totalEstimado.toFixed(2)),
          custo_medio_contrato_brl: Number(custoContratoBRL.toFixed(2)),
          percentual_custo: percentual,
          gas_contrato: gasTotal
        };
      });

      switch (orderBy) {
        case "estabelecimentos":
          resultado.sort((a, b) => b.estabelecimentos - a.estabelecimentos);
          break;
        case "valor_vendas":
          resultado.sort((a, b) => b.valor_vendas - a.valor_vendas);
          break;
        default:
          resultado.sort((a, b) => b.total_estimado_brl - a.total_estimado_brl);
      }

      const topN = top ? Number(top) : resultado.length;
      // console.log("JSON FINAL:", resultado[0]);

      res.json(resultado.slice(0, topN));

    } catch (err) {
      console.error("Erro em /results:", err);
      res.status(500).send("Erro ao gerar resultados combinados");
    }
  });

  return router;
};
