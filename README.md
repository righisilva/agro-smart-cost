# Agro Smart Cost

Ferramenta para estimar e comparar custos de execução de contratos inteligentes em redes blockchain, integrando medições on-chain com indicadores econômicos do agronegócio brasileiro.

---


## 🎯 Objetivo

O projeto tem como objetivo analisar a viabilidade econômica da adoção de blockchain em sistemas agroindustriais, considerando os custos de execução de contratos inteligentes em diferentes redes.

A abordagem combina:

- Consumo de gas (execução real)
- Preço das criptomoedas
- Indicadores econômicos do IBGE

---

## ⚙️ Funcionalidades

- Estimativa de custo de deploy e execução de contratos
- Comparação entre redes (Ethereum, BNB Chain, Polygon)
- Coleta automática de gas price via RPC
- Conversão de custos para USD e BRL
- Armazenamento de histórico
- Integração com dados do IBGE

---

## 🏗️ Arquitetura

A solução é composta por:

- Frontend web (HTML/CSS/JS)
- Backend Node.js (Express)
- Banco de dados SQLite
- Integração com APIs externas (preço e RPC)

Fluxo:

1. Compilação do contrato (solc)
2. Deploy e execução (Hardhat)
3. Coleta de gas
4. Cálculo de custos
5. Armazenamento e visualização

---

## 🛠️ Tecnologias

- Node.js
- Express
- Ethers.js (v5)
- Hardhat
- SQLite
- Axios
- APIs externas (RPC + preços)

---

## 🚀 Instalação

```bash
sudo apt install npm
npm install --legacy-peer-deps