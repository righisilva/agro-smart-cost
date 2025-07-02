// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.18;

contract SupplyChain {
    address owner_address;
    string product_name; 
    uint product_quantity;
    string product_expedition_date;
    string produt_type; //Variedade ou cultivar
    string batch_id;

    bool is_bougth;

    bool is_active;

    constructor(string memory product_name_param) {
        product_name = product_name_param;
        batch_id = "";
        is_bougth = false;
        owner_address = msg.sender;
        is_active = true;
    }

	event StatusUpdated(string indexed category, address indexed who, string message);
	event ProductBought(address indexed buyer);
	event ContractPaused();

    modifier onlyIfActive() {
        require(is_active, "Contract is not active");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner_address, "Not the owner");
        _;
    }

    struct StatusUpdate {
        address who;
        string message;
        string buyer_name; //Nome ou razão social
        string buyer_identification; // CPF, I.E ou CNPJ ou CGC/MAPA
        string current_location;
        uint updated_type; // 1 - Production, 2 - Transport, 3 - Store
    }

    StatusUpdate[] supply_chain;

    function addState(string memory message, string memory buyer_name, string memory buyer_identification, string memory current_location, uint type_param) public onlyOwner  onlyIfActive {
        supply_chain.push(StatusUpdate({
            who: msg.sender,
            message: message,
            updated_type: type_param,
            buyer_name: buyer_name, 
            buyer_identification: buyer_identification,
            current_location: current_location
        }));
		emit StatusUpdated("Preparation", msg.sender, message);
    }

	function buyProduct() public onlyIfActive{
		require(is_bougth == false, "This product is not real");
		require(supply_chain.length > 0, "No data to buy product");
		is_bougth = true;
		emit ProductBought(msg.sender);
	}

    function getAllInsupply_chain() public view onlyIfActive returns (address[] memory, string[] memory, uint[] memory) {
        uint length = supply_chain.length;
        address[] memory addresses = new address[](length);
        string[] memory messages = new string[](length);
        uint[] memory updated_types = new uint[](length);

        for (uint i = 0; i < length; i++) {
            addresses[i] = supply_chain[i].who;
            messages[i] = supply_chain[i].message;
            updated_types[i] = supply_chain[i].updated_type;
        }
        return (addresses, messages, updated_types);
    }

	function getProductDetails() public view returns (address, string memory, uint, string memory, string memory, string memory) {
		return (owner_address, product_name, product_quantity, product_expedition_date, produt_type, batch_id);
	}

    function pause() public onlyOwner returns (bool) {
        is_active = false;
		emit ContractPaused();
        return true;
    }

	function resume() public onlyOwner returns (bool) {
		is_active = true;
		return true;
	}

}
