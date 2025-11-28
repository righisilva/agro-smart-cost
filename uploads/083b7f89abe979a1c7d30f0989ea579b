// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./token_721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenManager721 is Ownable {
    Token721 public token721;

    // Mapeamento de endereços permitidos para operações restritas
    mapping(address => bool) public allowedAddresses;
    // Tokens criados por cada endereço
    mapping(address => uint256[]) private createdTokens;
    // Tokens que tiveram status atualizados por cada endereço
    mapping(address => uint256[]) private statusUpdatedTokens;
    // Mapeia batchId para lista de tokens
    mapping(string => uint256[]) public batchIdToTokens;

    /**
     * @dev Construtor. Cria instância do Token721 e define o owner.
     */
    constructor() Ownable(msg.sender) {
        token721 = new Token721("token721", "LTKN", address(this));
    }

    /**
     * @dev Retorna o nome do token.
     */
    function name() external view returns (string memory) {
        return token721.name();
    }

    /**
     * @dev Retorna o símbolo do token.
     */
    function symbol() external view returns (string memory) {
        return token721.symbol();
    }

    /**
     * @dev Ativa ou desativa um produto/token.
     * @param caller Endereço que está executando a operação.
     * @param tokenId ID do token.
     * @param isActive Define se o produto estará ativo ou não.
     */
    function setProductIsActive(
        address caller,
        uint256 tokenId,
        bool isActive
    ) external onlyTokenOwnerOrAdmin(caller, tokenId) {
        token721.setProductActive(tokenId, isActive);
    }

    /**
     * @dev Modificador: exige que o produto esteja ativo.
     */
    modifier checkIsActive(uint256 tokenId) {
        require(token721.getProduct(tokenId).isActive, "Product is not active");
        _;
    }

    /**
     * @dev Modificador: exige que o endereço seja owner ou permitido.
     */
    modifier onlyAllowed(address caller) {
        require(caller == owner() || allowedAddresses[caller], "Not allowed");
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
    }

    /**
     * @dev Modificador: exige que o sender seja owner ou dono do token.
     */
    modifier onlyTokenOwnerOrAdmin(address caller, uint256 tokenId) {
        require(
            caller == owner() || caller == token721.ownerOf(tokenId),
            "Not authorized"
        );
        _;
    }

    /**
     * @dev Cria um novo token (batch raiz) e associa ao usuário e batchId.
     * @param who Endereço que está executando a operação.
     * @param to Endereço que receberá o token.
     * @param productName Nome do produto.
     * @param productExpeditionDate Data de expedição.
     * @param productType Tipo do produto.
     * @param batchId Identificador do lote.
     * @param unitOfmeasure Unidade de medida.
     * @param batchQuantity Quantidade do lote.
     * @return O novo tokenId criado.
     */
    function mintRootBatch(
        address who,
        address to,
        string memory productName,
        string memory productExpeditionDate,
        string memory productType,
        string memory batchId,
        string memory unitOfmeasure,
        uint256 batchQuantity
    ) external onlyAllowed(who) returns (uint256) {
        uint256 newTokenId = token721.mintProduct(
            who,
            to,
            productName,
            productExpeditionDate,
            productType,
            batchId,
            unitOfmeasure,
            batchQuantity
        );
        createdTokens[to].push(newTokenId);
        batchIdToTokens[batchId].push(newTokenId);

        return newTokenId;
    }

    /**
     * @dev Cria um novo token a partir de um token pai, copiando informações e ajustando quantidade/unidade.
     * @param who Endereço que está executando a operação.
     * @param parentTokenId Token pai.
     * @param to Endereço que receberá o novo token.
     * @param newUnityOfMeasure Nova unidade de medida.
     * @param newBatchQuantity Nova quantidade do lote.
     */
    function splitBatch(
        address who,
        uint256 parentTokenId,
        address to,
        string memory newUnityOfMeasure,
        uint256 newBatchQuantity
    )
        external
        onlyTokenOwnerOrAdmin(who, parentTokenId)
        checkIsActive(parentTokenId)
    {
        Token721.Product memory parentProduct = token721.getProduct(
            parentTokenId
        );
        require(
            newBatchQuantity > 0,
            "Batch quantity must be greater than zero"
        );

        token721.reduceBatchQuantity(who, parentTokenId, newBatchQuantity);

        string memory batchId = parentProduct.batchId;

        uint256 newTokenId = token721.mintProduct(
            who,
            to,
            parentProduct.productName,
            parentProduct.productExpeditionDate,
            parentProduct.productType,
            batchId,
            newUnityOfMeasure,
            newBatchQuantity
        );

        batchIdToTokens[batchId].push(newTokenId);
        createdTokens[to].push(newTokenId);
    }

    /**
     * @dev Adiciona uma atualização de status ao token.
     * @param updater Endereço que está adicionando a atualização.
     * @param tokenId ID do token.
     * @param message Mensagem da atualização.
     * @param buyerName Nome do comprador (se aplicável).
     * @param buyerIdentification Identificação do comprador (se aplicável).
     * @param currentLocation Localização atual do produto.
     * @param updateType Tipo de atualização (1-Produção, 2-Transporte, 3-Armazenamento).
     */
    function addStatus(
        address updater,
        uint256 tokenId,
        string memory message,
        string memory buyerName,
        string memory buyerIdentification,
        string memory currentLocation,
        Token721.UpdateType updateType
    ) external onlyTokenOwnerOrAdmin(updater, tokenId) checkIsActive(tokenId) {
        token721.addStatus(
            updater,
            tokenId,
            message,
            buyerName,
            buyerIdentification,
            currentLocation,
            updateType
        );
        statusUpdatedTokens[updater].push(tokenId);
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
     * @dev Retorna as informações dos produtos de uma lista de tokens.
     * @param tokenIds Lista de tokenIds.
     * @return products Array de produtos.
     */
    function getBatchProducts(
        uint256[] memory tokenIds
    ) external view returns (Token721.Product[] memory products) {
        uint256 len = tokenIds.length;
        products = new Token721.Product[](len);

        for (uint256 i = 0; i < len; ++i) {
            products[i] = token721.getProduct(tokenIds[i]);
        }
    }

    /**
     * @dev Retorna os históricos de status de uma lista de tokens.
     * @param tokenIds Lista de tokenIds.
     * @return histories Array de históricos de status.
     */
    function getBatchHistories(
        uint256[] memory tokenIds
    ) external view returns (Token721.StatusUpdate[][] memory histories) {
        uint256 len = tokenIds.length;
        histories = new Token721.StatusUpdate[][](len);

        for (uint256 i = 0; i < len; ++i) {
            histories[i] = token721.getProductStatus(tokenIds[i]);
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
}
