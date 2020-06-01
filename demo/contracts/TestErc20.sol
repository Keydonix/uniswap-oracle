pragma solidity 0.6.8;

contract TestErc20 {
	event Transfer(address indexed from, address indexed to, uint256 value);
	event Approval(address indexed owner, address indexed spender, uint256 value);
	mapping (address => uint256) public balanceOf;
	mapping (address => mapping (address => uint256)) public allowance;
	uint256 public totalSupply;
	string public symbol;
	string public name;

	constructor(string memory _symbol, string memory _name) public {
		symbol = _symbol;
		name = _name;
	}
	function kill() public {
		selfdestruct(msg.sender);
	}
	function mint(uint256 amount) public {
		totalSupply += amount;
		balanceOf[msg.sender] += amount;
	}
	function burn(uint256 amount) public {
		require(balanceOf[msg.sender] >= amount);
		totalSupply -= amount;
		balanceOf[msg.sender] -= amount;
	}
	function transfer(address recipient, uint256 amount) public returns (bool) {
		_transfer(msg.sender, recipient, amount);
		return true;
	}
	function approve(address spender, uint256 amount) public returns (bool) {
		allowance[msg.sender][spender] = amount;
		emit Approval(msg.sender, spender, amount);
		return true;
	}
	function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
		uint256 startingAllowance = allowance[msg.sender][sender];
		require(startingAllowance >= amount);
		if (startingAllowance < uint256(-1)) {
			allowance[msg.sender][sender] = startingAllowance - amount;
		}
		_transfer(sender, recipient, amount);
		return true;
	}

	function _transfer(address sender, address recipient, uint256 amount) internal {
		require(balanceOf[sender] >= amount);
		balanceOf[sender] -= amount;
		balanceOf[recipient] += amount;
		emit Transfer(sender, recipient, amount);
	}
}
