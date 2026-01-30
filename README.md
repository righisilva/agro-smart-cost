```
sudo apt install npm
npm install ou npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox --legacy-peer-deps
npx hardhat node
node index.js caminho_do_contrato
node server.js
``` 
```
mkdir gas-estimator 
cd gas-estimator 
npm init -y
npm install solc ethers dotenv npm install axios npm install ethers@5
npm install @openzeppelin/contracts
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox --legacy-peer-deps
npm install csv-writer --legacy-peer-deps
npm install googleapis --legacy-peer-deps
npm install express --legacy-peer-deps
npm install multer --legacy-peer-deps
npm install better-sqlite3 --legacy-peer-deps
npm install csv-parser better-sqlite3 --legacy-peer-deps

```

Executar automaticamente:

```python
crontab -e
```
Na primeira vez, ele pode pedir que você escolha um editor (como nano — pode aceitar o padrão).

Adicione esta linha no fim do arquivo:

```python
* * * * * cd /media/fabio/Arquivos/Documentos/MES/gas-estimator && /usr/bin/node index.js Contrato.sol >> cron.log 2>&1
```
Para parar:

```python
crontab -r
```

Rodar HardHat automaticamente
Instale o pm2:

```python
sudo npm install -g pm2
```

Inicie o node com:

```python
pm2 start --name hardhat-node "npx hardhat node"
pm2 save
```

Configure o startup script para o sistema operacional

pm2 startup
Dar o comando sugerido

[PM2] Freeze a process list on reboot via:
```python
pm2 save
```

[PM2] Remove init script via:
```python
pm2 unstartup systemd
```


Verifique status:

```python
pm2 status
```

Para logs:

```python
pm2 logs hardhat-node
```

Para parar:

```python
pm2 stop hardhat-node
```


'''
psql "postgresql://neondb_owner:npg_ihVfEra6tbX1@ep-cold-term-acrc0q94-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"
'''


'''
SELECT * FROM networks;
SELECT * FROM gas_history;
'''

'''
TRUNCATE TABLE gas_history, networks RESTART IDENTITY;
'''