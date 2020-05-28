pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

contract UniswapOracle {
	struct ProofData {
		bytes block;
		bytes accountProofNodesRlp;
		bytes reserveAndTimestampProofNodesRlp;
		bytes priceProofNodesRlp;
	}
	function getPrice(address /*exchange*/, address /*denominationToken*/, uint8 /*minBlocksBack*/, uint8 /*maxBlocksBack*/, ProofData memory /*proofData*/) public pure returns (uint256 price, uint256 blockNumber) {
		price = 0;
		blockNumber = 0;
		return (price, blockNumber);
	}
}
