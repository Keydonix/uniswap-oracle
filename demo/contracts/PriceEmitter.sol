pragma solidity >=0.8.0;

import { UniswapOracle } from  "@keydonix/UniswapOracle.sol";
import { IUniswapV2Pair } from "@keydonix/IUniswapV2Pair.sol";

contract PriceEmitter is UniswapOracle {
	event Price(uint256 price);

	function emitPrice(IUniswapV2Pair exchange, address denominationToken, uint8 minBlocksBack, uint8 maxBlocksBack, UniswapOracle.ProofData memory proofData) public returns (uint256 price, uint256 blockNumber) {
		(price, blockNumber) = getPrice(exchange, denominationToken, minBlocksBack, maxBlocksBack, proofData);
		emit Price(price);
	}
}
