// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.22;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";

contract SupplyChain1155 is ERC1155, Ownable, ERC1155Supply {
    uint256 private _tokenCounter;

    enum UpdateType { Production, Transport, Storage }

    struct Product {
        string productName;
        string productExpeditionDate;
        string productType;
        string batchId;
        bool isBought;
        bool isActive;
    }

    struct StatusUpdate {
        address who;
        string message;
        string buyerName;
        string buyerIdentification;
        string currentLocation;
        UpdateType updateType;
    }

    mapping(uint256 => Product) public products;
    mapping(uint256 => StatusUpdate[]) public supplyChains;
    mapping(address => bool) public allowedAddresses; // Global whitelist

    event ProductMinted(uint256 indexed tokenId, address indexed owner, uint256 quantity);
    event StatusUpdated(uint256 indexed tokenId, string category, address indexed who, string message);
    event ProductBought(uint256 indexed tokenId, address indexed buyer);
    event ProductPaused(uint256 indexed tokenId);
    event ProductResumed(uint256 indexed tokenId);
    event AddressAllowed(address indexed account, bool isAllowed);

    constructor() ERC1155("") Ownable(msg.sender) {}

    modifier onlyIfActive(uint256 tokenId) {
        require(products[tokenId].isActive, "Product is not active");
        _;
    }

    modifier onlyAllowed() {
        require(
            msg.sender == owner() || allowedAddresses[msg.sender],
            "Not allowed"
        );
        _;
    }

    modifier onlyTokenOwnerOrAdmin(uint256 tokenId) {
        require(
            msg.sender == owner() || balanceOf(msg.sender, tokenId) > 0,
            "Not holder or admin"
        );
        _;
    }

    function setAllowedAddress(address account, bool isAllowed) external onlyOwner {
        allowedAddresses[account] = isAllowed;
        emit AddressAllowed(account, isAllowed);
    }

    function addStatus(
        uint256 tokenId,
        string memory message,
        string memory buyerName,
        string memory buyerIdentification,
        string memory currentLocation,
        UpdateType updateType
    ) external onlyIfActive(tokenId) onlyTokenOwnerOrAdmin(tokenId) {
        supplyChains[tokenId].push(StatusUpdate({
            who: msg.sender,
            message: message,
            buyerName: buyerName,
            buyerIdentification: buyerIdentification,
            currentLocation: currentLocation,
            updateType: updateType
        }));

        emit StatusUpdated(tokenId, "Update", msg.sender, message);
    }

    function mintProduct(
        uint256 quantity,
        string memory productName,
        string memory productExpeditionDate,
        string memory productType,
        string memory batchId
    ) external onlyAllowed {
        uint256 tokenId = _tokenCounter++;

        products[tokenId] = Product({
            productName: productName,
            productExpeditionDate: productExpeditionDate,
            productType: productType,
            batchId: batchId,
            isBought: false,
            isActive: true
        });

        _mint(msg.sender, tokenId, quantity, "");

        emit ProductMinted(tokenId, msg.sender, quantity);
    }

    function buyProduct(uint256 tokenId) external onlyIfActive(tokenId) onlyAllowed {
        require(supplyChains[tokenId].length > 0, "No supply chain data");
        require(balanceOf(msg.sender, tokenId) >= 1, "Insufficient balance");

        _burn(msg.sender, tokenId, 1);

        uint256 newTokenId = _tokenCounter++;

        Product memory original = products[tokenId];

        products[newTokenId] = Product({
            productName: original.productName,
            productExpeditionDate: original.productExpeditionDate,
            productType: original.productType,
            batchId: original.batchId,
            isBought: true,
            isActive: true
        });

        for (uint256 i = 0; i < supplyChains[tokenId].length; ++i) {
            supplyChains[newTokenId].push(supplyChains[tokenId][i]);
        }

        _mint(msg.sender, newTokenId, 1, "");

        emit ProductBought(newTokenId, msg.sender);
    }

    function pauseProduct(uint256 tokenId) external onlyOwner {
        products[tokenId].isActive = false;
        emit ProductPaused(tokenId);
    }

    function resumeProduct(uint256 tokenId) external onlyOwner {
        products[tokenId].isActive = true;
        emit ProductResumed(tokenId);
    }

    function getSupplyChain(uint256 tokenId)
        external
        view
        onlyTokenOwnerOrAdmin(tokenId)
        returns (
            address[] memory who,
            string[] memory message,
            string[] memory buyerName,
            string[] memory buyerIdentification,
            string[] memory currentLocation,
            UpdateType[] memory updateType
        )
    {
        uint256 len = supplyChains[tokenId].length;

        who = new address[](len);
        message = new string[](len);
        buyerName = new string[](len);
        buyerIdentification = new string[](len);
        currentLocation = new string[](len);
        updateType = new UpdateType[](len);

        for (uint256 i = 0; i < len; ++i) {
            StatusUpdate storage s = supplyChains[tokenId][i];
            who[i] = s.who;
            message[i] = s.message;
            buyerName[i] = s.buyerName;
            buyerIdentification[i] = s.buyerIdentification;
            currentLocation[i] = s.currentLocation;
            updateType[i] = s.updateType;
        }
    }

    function getProductDetails(uint256 tokenId)
        external
        view
        onlyTokenOwnerOrAdmin(tokenId)
        returns (
            string memory productName,
            string memory expeditionDate,
            string memory productType,
            string memory batchId,
            bool isBought,
            bool isActive
        )
    {
        Product memory p = products[tokenId];
        return (
            p.productName,
            p.productExpeditionDate,
            p.productType,
            p.batchId,
            p.isBought,
            p.isActive
        );
    }

    function transferProduct(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes calldata data
    ) external onlyTokenOwnerOrAdmin(tokenId){
        require(products[tokenId].isActive, "Product is not active");

        safeTransferFrom(from, to, tokenId, amount, data);
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
    }
}
