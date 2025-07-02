// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./token_1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenManager1155 is Ownable {
    Token1155 public token1155;

    // Mapeamento de endereços permitidos para operações restritas
    mapping(address => bool) public allowedAddresses;
    // Tokens criados por cada endereço
    mapping(address => uint256[]) private createdTokens;
    // Tokens que tiveram status atualizados por cada endereço
    mapping(address => uint256[]) private statusUpdatedTokens;
    // Mapeia batchId para lista de tokens
    mapping(string => uint256[]) public batchIdToTokens;

    /**
     * @dev Construtor. Cria instância do Token1155 e define o owner.
     */
    constructor() Ownable(msg.sender) {
        token1155 = new Token1155(address(this));
    }

    /**
     * @dev Modificador: exige que o endereço seja owner ou permitido.
     */
    modifier onlyAllowed() {
        require(
            msg.sender == owner() || allowedAddresses[msg.sender],
            "Not allowed"
        );
        _;
    }

    /**
     * @dev Permite ou remove permissão de um endereço para funções restritas.
     * @param account Endereço a ser alterado.
     * @param isAllowed Se o endereço será permitido ou não.
     */
    function setAllowedAddress(
        address account,
        bool isAllowed
    ) external onlyOwner {
        allowedAddresses[account] = isAllowed;
        emit AllowedAddressUpdated(account, isAllowed);
    }

    /**
     * @dev Modificador: exige que o sender seja owner ou detentor do token.
     */
    modifier onlyTokenOwnerOrAdmin(uint256 tokenId) {
        require(
            msg.sender == owner() ||
                token1155.balanceOf(msg.sender, tokenId) > 0,
            "Not holder or admin"
        );
        _;
    }

    /**
     * @dev Ativa ou desativa um produto/token.
     * @param tokenId ID do token.
     * @param isActive Define se o produto estará ativo ou não.
     */
    function setProductIsActive(
        uint256 tokenId,
        bool isActive
    ) external onlyOwner {
        token1155.setProductActive(tokenId, isActive);
    }

    /**
     * @dev Cria um novo token (batch raiz) e associa ao usuário e batchId.
     * @param to Endereço que receberá o token.
     * @param productName Nome do produto.
     * @param productExpeditionDate Data de expedição.
     * @param productType Tipo do produto.
     * @param unitOfMeasure Unidade de medida.
     * @param batchId Identificador do lote.
     * @param batchQuantity Quantidade do lote.
     * @return O novo tokenId criado.
     */
    function mintRootBatch(
        address to,
        string memory productName,
        string memory productExpeditionDate,
        string memory productType,
        string memory unitOfMeasure,
        string memory batchId,
        uint256 batchQuantity
    ) external onlyAllowed returns (uint256) {
        uint256 newTokenId = token1155.mintProduct(
            to,
            productName,
            productExpeditionDate,
            productType,
            unitOfMeasure,
            batchId,
            batchQuantity
        );

        createdTokens[to].push(newTokenId);
        batchIdToTokens[batchId].push(newTokenId);

        return newTokenId;
    }

    /**
     * @dev Cria um novo token a partir de um token pai, copiando informações e ajustando quantidade/unidade.
     * @param parentTokenId Token pai.
     * @param to Endereço que receberá o novo token.
     * @param newUnitOfMeasure Nova unidade de medida.
     * @param newBatchQuantity Nova quantidade do lote.
     */
    function splitBatch(
        uint256 parentTokenId,
        address to,
        string memory newUnitOfMeasure,
        uint256 newBatchQuantity
    )
        external
        onlyTokenOwnerOrAdmin(parentTokenId)
        checkIsActive(parentTokenId)
    {
        require(newBatchQuantity > 0, "Quantity must be > 0");

        Token1155.Product memory parent = token1155.getProduct(parentTokenId);

        uint256 newTokenId = token1155.mintProduct(
            to,
            parent.productName,
            parent.productExpeditionDate,
            parent.productType,
            newUnitOfMeasure,
            parent.batchId,
            newBatchQuantity
        );

        createdTokens[to].push(newTokenId);
        batchIdToTokens[parent.batchId].push(newTokenId);
    }

    /**
     * @dev Adiciona uma atualização de status ao token.
     * @param tokenId ID do token.
     * @param message Mensagem da atualização.
     * @param buyerName Nome do comprador (se aplicável).
     * @param buyerIdentification Identificação do comprador (se aplicável).
     * @param currentLocation Localização atual do produto.
     * @param updateType Tipo de atualização (0-Produção, 1-Transporte, 2-Armazenamento).
     */
    function addStatus(
        uint256 tokenId,
        string memory message,
        string memory buyerName,
        string memory buyerIdentification,
        string memory currentLocation,
        uint256 updateType
    ) external onlyTokenOwnerOrAdmin(tokenId) checkIsActive(tokenId) {
        token1155.addStatus(
            tokenId,
            message,
            buyerName,
            buyerIdentification,
            currentLocation,
            updateType
        );
        statusUpdatedTokens[msg.sender].push(tokenId);
    }

    /**
     * @dev Retorna os tokens criados por uma lista de usuários.
     * @param users Lista de endereços de usuários.
     * @return userBatches Lista de arrays de tokenIds por usuário.
     */
    function getUsersBatches(
        address[] memory users
    ) external view returns (uint256[][] memory userBatches) {
        uint256 len = users.length;
        userBatches = new uint256[][](len);
        for (uint256 i = 0; i < len; ++i) {
            userBatches[i] = createdTokens[users[i]];
        }
    }

    /**
     * @dev Retorna informações completas (produto e histórico) de uma lista de tokens.
     * @param tokenIds Lista de tokenIds.
     * @return productList Array de produtos.
     * @return historyList Array de históricos de status.
     */
    function getFullBatchsInfo(
        uint256[] memory tokenIds
    )
        external
        view
        returns (
            Token1155.Product[] memory productList,
            Token1155.StatusUpdate[][] memory historyList
        )
    {
        uint256 len = tokenIds.length;
        productList = new Token1155.Product[](len);
        historyList = new Token1155.StatusUpdate[][](len);

        for (uint256 i = 0; i < len; ++i) {
            productList[i] = token1155.getProduct(tokenIds[i]);
            historyList[i] = token1155.getProductStatus(tokenIds[i]);
        }
    }

    /**
     * @dev Retorna todos os tokens associados a um batchId.
     * @param batchId Identificador do lote.
     * @return Lista de tokenIds associados ao batchId.
     */
    function getTokensByBatchId(
        string memory batchId
    ) external view returns (uint256[] memory) {
        return batchIdToTokens[batchId];
    }

    /**
     * @dev Transfere todos os tokens de um determinado tokenId de um usuário para outro.
     * @param from Endereço remetente.
     * @param to Endereço destinatário.
     * @param tokenId ID do token.
     * @param data Dados adicionais.
     */
    function transferProduct(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata data
    ) external onlyTokenOwnerOrAdmin(tokenId) {
        uint256 amount = token1155.balanceOf(from, tokenId);

        require(amount > 0, "No tokens to transfer");

        token1155.safeTransferFrom(from, to, tokenId, amount, data);

        emit ProductTransferred(tokenId, from, to, amount);
    }

    /**
     * @dev Retorna o saldo do usuário e o total emitido de um token.
     * @param account Endereço do usuário.
     * @param tokenId ID do token.
     * @return userBalance Saldo do usuário.
     * @return totalMinted Total emitido do token.
     */
    function getTokenQuantities(
        address account,
        uint256 tokenId
    ) external view returns (uint256 userBalance, uint256 totalMinted) {
        return token1155.getTokenQuantities(account, tokenId);
    }

    /**
     * @dev Modificador: exige que o produto esteja ativo.
     */
    modifier checkIsActive(uint256 tokenId) {
        require(
            token1155.getProduct(tokenId).isActive,
            "Product is not active"
        );
        _;
    }
}
