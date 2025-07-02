// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Token721 is ERC721URIStorage, Ownable {
    uint256 private _tokenIds;

    /**
     * @dev Estrutura que representa um produto/token.
     */
    struct Product {
        address originalOwner;
        string productName;
        string productExpeditionDate;
        string productType;
        string batchId;
        string unitOfMeasure;
        uint256 batchQuantity;
        bool isBought;
        bool isActive;
    }

    /**
     * @dev Estrutura que representa uma atualização de status do produto.
     */
    struct StatusUpdate {
        address who;
        string message;
        string buyerName;
        string buyerIdentification;
        string currentLocation;
        uint256 updateType; // 1 - Produção, 2 - Transporte, 3 - Armazenamento
    }

    mapping(uint256 => Product) public products;
    mapping(uint256 => StatusUpdate[]) public statusHistory;

    /**
     * @dev Construtor do contrato. Inicializa o ERC721 e define o owner.
     * @param name Nome do token ERC721.
     * @param symbol Símbolo do token ERC721.
     * @param initialOwner Endereço do owner inicial.
     */
    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC721(name, symbol) Ownable(initialOwner) {}

    /**
     * @dev Ativa ou desativa um produto/token.
     * @param tokenId ID do token.
     * @param active Define se o produto estará ativo ou não.
     */
    function setProductActive(uint256 tokenId, bool active) external onlyOwner {
        products[tokenId].isActive = active;
    }

    /**
     * @dev Retorna as informações do produto de um token.
     * @param tokenId ID do token.
     * @return Produto correspondente ao tokenId.
     */
    function getProduct(
        uint256 tokenId
    ) external view returns (Product memory) {
        return products[tokenId];
    }

    /**
     * @dev Retorna o histórico de status de um token.
     * @param tokenId ID do token.
     * @return Array de StatusUpdate do token.
     */
    function getProductStatus(
        uint256 tokenId
    ) external view returns (StatusUpdate[] memory) {
        return statusHistory[tokenId];
    }

    /**
     * @dev Cria um novo token de produto.
     * @param to Endereço que receberá o token.
     * @param productName Nome do produto.
     * @param productExpeditionDate Data de expedição do produto.
     * @param productType Tipo do produto.
     * @param batchId Identificador do lote.
     * @param unitOfmeasure Unidade de medida do lote.
     * @param batchQuantity Quantidade do lote.
     * @return O novo tokenId criado.
     */
    function mintProduct(
        address to,
        string memory productName,
        string memory productExpeditionDate,
        string memory productType,
        string memory batchId,
        string memory unitOfmeasure,
        uint256 batchQuantity
    ) external returns (uint256) {
        _tokenIds++;
        uint256 newTokenId = _tokenIds;
        _mint(to, newTokenId);
        address who = msg.sender;

        products[newTokenId] = Product(
            who,
            productName,
            productExpeditionDate,
            productType,
            batchId,
            unitOfmeasure,
            batchQuantity,
            false,
            true
        );

        return newTokenId;
    }

    /**
     * @dev Adiciona uma atualização de status ao token.
     * @param tokenId ID do token.
     * @param message Mensagem da atualização.
     * @param buyerName Nome do comprador (se aplicável).
     * @param buyerIdentification Identificação do comprador (se aplicável).
     * @param currentLocation Localização atual do produto.
     * @param updateType Tipo de atualização (1-Produção, 2-Transporte, 3-Armazenamento).
     */
    function addStatus(
        uint256 tokenId,
        string memory message,
        string memory buyerName,
        string memory buyerIdentification,
        string memory currentLocation,
        uint256 updateType
    ) external {
        statusHistory[tokenId].push(
            StatusUpdate(
                msg.sender,
                message,
                buyerName,
                buyerIdentification,
                currentLocation,
                updateType
            )
        );
    }

    /**
     * @dev Retorna as informações completas do lote (produto e histórico).
     * @param tokenId ID do token.
     * @return Produto e array de StatusUpdate.
     */
    function getFullBatchInfo(
        uint256 tokenId
    ) external view returns (Product memory, StatusUpdate[] memory) {
        return (products[tokenId], statusHistory[tokenId]);
    }

    /**
     * @dev Reduz a quantidade do lote de um token.
     * @param tokenId ID do token.
     * @param amount Quantidade a ser reduzida.
     */
    function reduceBatchQuantity(uint256 tokenId, uint256 amount) external {
        products[tokenId].batchQuantity -= amount;
    }
}
