// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Token {
    string public name = "MeuToken";
    string public symbol = "MTK";
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(uint256 initialSupply) {
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Saldo insuficiente");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}

contract TokenSale {
    Token public token;
    uint256 public pricePerToken;

    event TokensBought(address indexed buyer, uint256 amount, uint256 cost);

    constructor(Token _token, uint256 _pricePerToken) {
        token = _token;
        pricePerToken = _pricePerToken;
    }

    function buyTokens(uint256 amount) public payable {
        uint256 cost = amount * pricePerToken;
        require(msg.value >= cost, "Ether insuficiente");

        require(token.transfer(msg.sender, amount), "Falha na transferencia de tokens");

        emit TokensBought(msg.sender, amount, cost);

        // Devolver excesso de Ether
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
    }
}

