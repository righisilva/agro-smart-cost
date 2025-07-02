// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";

contract Token1155 is ERC1155, Ownable, ERC1155Supply {
    uint256 private _tokenIds;

    /**
     * @dev Tipos de atualização de status do produto.
     */
    enum UpdateType {
        Production,
        Transport,
        Storage
    }

    /**
     * @dev Estrutura que representa um produto/token.
     */
    struct Product {
        string productName;
        string productExpeditionDate;
        string productType;
        string batchId;
        string unitOfMeasure;
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
        UpdateType updateType;
    }

    // Mapeamento de tokenId para produto
    mapping(uint256 => Product) public products;
    // Mapeamento de tokenId para histórico de status
    mapping(uint256 => StatusUpdate[]) public statusHistory;

    /**
     * @dev Construtor do contrato. Inicializa o ERC1155 e define o owner.
     * @param ownerAddress Endereço do owner inicial.
     */
    constructor(address ownerAddress) ERC1155("") Ownable(ownerAddress) {}

    /**
     * @dev Ativa ou desativa um produto/token.
     * @param tokenId ID do token.
     * @param active Define se o produto estará ativo ou não.
     */
    function setProductActive(uint256 tokenId, bool active) external onlyOwner {
        products[tokenId].isActive = active;
    }

    /**
     * @dev Modificador: exige que o sender seja o owner (manager).
     */
    modifier onlyManager() {
        require(msg.sender == owner(), "Only manager");
        _;
    }

    /**
     * @dev Cria um novo token de produto.
     * @param to Endereço que receberá o token.
     * @param productName Nome do produto.
     * @param productExpeditionDate Data de expedição do produto.
     * @param productType Tipo do produto.
     * @param unitOfMeasure Unidade de medida do lote.
     * @param batchId Identificador do lote.
     * @param batchQuantity Quantidade do lote.
     * @return O novo tokenId criado.
     */
    function mintProduct(
        address to,
        string memory productName,
        string memory productExpeditionDate,
        string memory productType,
        string memory unitOfMeasure,
        string memory batchId,
        uint256 batchQuantity
    ) external onlyManager checkIsActive(_tokenIds) returns (uint256) {
        uint256 newTokenId = _tokenIds++;

        products[newTokenId] = Product({
            productName: productName,
            productExpeditionDate: productExpeditionDate,
            productType: productType,
            batchId: batchId,
            unitOfMeasure: unitOfMeasure,
            isBought: false,
            isActive: true
        });

        _mint(to, newTokenId, batchQuantity, "");
        return newTokenId;
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
    ) external onlyManager checkIsActive(tokenId) {
        require(
            updateType <= uint256(UpdateType.Storage),
            "Invalid update type"
        );

        statusHistory[tokenId].push(
            StatusUpdate({
                who: msg.sender,
                message: message,
                buyerName: buyerName,
                buyerIdentification: buyerIdentification,
                currentLocation: currentLocation,
                updateType: UpdateType(updateType)
            })
        );
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
     * @dev Atualiza o estado dos tokens durante transferências (override do ERC1155Supply).
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
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
        userBalance = balanceOf(account, tokenId);
        totalMinted = totalSupply(tokenId);
    }
}
