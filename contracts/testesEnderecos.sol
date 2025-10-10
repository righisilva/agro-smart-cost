// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestAddresses {

    address public owner;
    address public admin;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AdminSet(address indexed previousAdmin, address indexed newAdmin);

    constructor() {
        owner = msg.sender;
    }

    // Função para transferir ownership
    function transferOwnership(address newOwner) public {
        require(msg.sender == owner, "Somente o owner pode transferir");
        require(newOwner != address(0), "Endereco invalido");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // Função para setar admin
    function setAdmin(address newAdmin) public {
        require(msg.sender == owner, "Somente o owner pode setar admin");
        require(newAdmin != address(0), "Endereco invalido");
        emit AdminSet(admin, newAdmin);
        admin = newAdmin;
    }

    // Retorna owner atual
    function getOwner() public view returns (address) {
        return owner;
    }

    // Retorna admin atual
    function getAdmin() public view returns (address) {
        return admin;
    }
}

