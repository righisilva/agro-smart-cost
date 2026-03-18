# Agro Smart Cost

🌐 Acesse a ferramenta:  
https://agro-smart-cost.onrender.com/

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

![Arquitetura](docs/imagens/Arquitetura.pdf)

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

```
git clone git@github.com:righisilva/agro-smart-cost.git
cd agro-smart-cost/
sudo apt install npm
npm install --legacy-peer-deps
```
Vai aparecer alguns avisos de incompatibilidade com a versão do Ethers 5.8.0. Mas isso não influencia no funcinamento da ferramenta.

---

## ▶️ Execução Local

### Iniciar node local (Hardhat)
```bash
npx hardhat node
```

### Iniciar servidor
Em outra janela do terminal:
```bash
node server.js
```
Em um navegador, acessar http://localhost:3000/


### Ou iniciar node local (Hardhat) + servidor
Se desejar utilizar apenas uma janela (a tela com os logs fica mais poluída):
```bash
npm start
```
Em um navegador, acessar http://localhost:3000/

---

## 🔄 Execução contínua do Hardhat (PM2)
Para preferir deixar o Hardhat rodando continuamente, mesmo após reinicialização do sistema,  pode usar o gerenciador de processos PM2

Para instalar
```bash
sudo npm install -g pm2
```
Para iniciar:
```bash
pm2 start --name hardhat-node "npx hardhat node"
pm2 save
pm2 startup
```
Conferir se funcionou:
```bash
pm2 logs hardhat-node
```
Para parar a execução:
```bash
pm2 stop hardhat-node
```
Para retomar a execução parada:
```bash
pm2 start hardhat-node
```
Para remover:
```bash
pm2 delete hardhat-node
```
---





## ⏱️ Execução automática (cron)
```
crontab -e
```
```bash
*/15 * * * * cd /SEU_CAMINHO/agro-smart-cost && /usr/bin/node buscaGas/buscaGasPrices.js >> buscaGas/cron.log 2>&1
```

---

## 🔄 Execução contínua (PM2)
sudo npm install -g pm2

    pm2 start --name hardhat-node "npx hardhat node"
    pm2 save
    pm2 startup

    pm2 logs hardhat-node

    pm2 stop hardhat-node

---

## 📄 Licença

MIT