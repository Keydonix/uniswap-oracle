pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { BlockVerifier } from "./BlockVerifier.sol";
import { MerklePatriciaVerifier } from "./MerklePatriciaVerifier.sol";
import { Rlp } from "./Rlp.sol";
import { IUniswapV2Pair } from "./IUniswapV2Pair.sol";
import { UQ112x112 } from "@Keydonix/UQ112x112.sol";

contract UniswapOracle {
	using UQ112x112 for uint224;

	bytes32 public constant reserveTimestampSlotHash = keccak256(abi.encodePacked(uint256(8)));
	bytes32 constant token0Slot = keccak256(abi.encodePacked(uint256(9)));
	bytes32 constant token1Slot = keccak256(abi.encodePacked(uint256(10)));

	struct ProofData {
		bytes block;
		bytes accountProofNodesRlp;
		bytes reserveAndTimestampProofNodesRlp;
		bytes priceProofNodesRlp;
	}

	function getAccountStorageRoot(address _uniswapV2Pair, ProofData memory proofData) public view returns (bytes32 storageRootHash, uint256 blockNumber, uint256 blockTimestamp) {
		bytes32 stateRoot;
		(stateRoot, blockTimestamp, blockNumber) = BlockVerifier.extractStateRootAndTimestamp(proofData.block);
		bytes memory accountDetailsBytes = MerklePatriciaVerifier.getValueFromProof(stateRoot, keccak256(abi.encodePacked(_uniswapV2Pair)), proofData.accountProofNodesRlp);
		Rlp.Item[] memory accountDetails = Rlp.toList(Rlp.toItem(accountDetailsBytes));
		return (Rlp.toBytes32(accountDetails[2]), blockNumber, blockTimestamp);
	}

	// This function verifies the full block is old enough (MIN_BLOCK_COUNT), not too old (or blockhash will return 0x0) and return the proof values for the two storage slots we care about
	function verifyBlockAndExtractReserveData(IUniswapV2Pair _uniswapV2Pair, uint8 minBlocksBack, uint8 maxBlocksBack, bytes32 slotHash, ProofData memory proofData) public view returns
	(uint256 blockTimestamp, uint256 blockNumber, uint256 priceCumulativeLast, uint112 reserve0, uint112 reserve1, uint256 reserveTimestamp) {
		bytes32 storageRootHash;
		(storageRootHash, blockNumber, blockTimestamp) = getAccountStorageRoot(address(_uniswapV2Pair), proofData);
		require (blockNumber < block.number - minBlocksBack, "Proof does not cover enough blocks");
		require (blockNumber > block.number - maxBlocksBack, "Proof covers too many");

		priceCumulativeLast = Rlp.rlpBytesToUint256(MerklePatriciaVerifier.getValueFromProof(storageRootHash, slotHash, proofData.priceProofNodesRlp));
		uint256 reserve0Reserve1TimestampPacked = Rlp.rlpBytesToUint256(MerklePatriciaVerifier.getValueFromProof(storageRootHash, reserveTimestampSlotHash, proofData.reserveAndTimestampProofNodesRlp));
		reserveTimestamp = reserve0Reserve1TimestampPacked >> (112 + 112);
		reserve1 = uint112((reserve0Reserve1TimestampPacked >> 112) & (2**112 - 1));
		reserve0 = uint112(reserve0Reserve1TimestampPacked & (2**112 - 1));
	}

	function getPrice(IUniswapV2Pair _uniswapV2Pair, address denominationToken, uint8 minBlocksBack, uint8 maxBlocksBack, ProofData memory proofData) public view returns (uint256 price, uint256 blockNumber) {
		// exchange = the ExchangeV2Pair. check denomination token (USE create2 check?!) check gas cost
		bool _demonitationTokenIs0;
		if (_uniswapV2Pair.token0() == denominationToken) {
			_demonitationTokenIs0 = true;
		} else if (_uniswapV2Pair.token1() == denominationToken) {
			_demonitationTokenIs0 = false;
		} else {
			revert("denominationToken invalid");
		}
		return getPriceRaw(_uniswapV2Pair, _demonitationTokenIs0, minBlocksBack, maxBlocksBack, proofData);
	}

	function getPriceRaw(IUniswapV2Pair _uniswapV2Pair, bool _demonitationTokenIs0, uint8 minBlocksBack, uint8 maxBlocksBack, ProofData memory proofData) public view returns (uint256 price, uint256 blockNumber) {
		uint256 historicBlockTimestamp;
		uint256 historicPriceCumulativeLast;
		{
			// Stack-too-deep workaround, manual scope
			// Side-note: wtf Solidity?
			uint112 reserve0;
			uint112 reserve1;
			uint256 reserveTimestamp;
			( , blockNumber, historicPriceCumulativeLast, reserve0, reserve1, reserveTimestamp) = verifyBlockAndExtractReserveData(_uniswapV2Pair, minBlocksBack, maxBlocksBack, _demonitationTokenIs0 ? token0Slot : token1Slot, proofData);
			uint256 secondsBetweenReserveUpdateAndHistoricBlock = historicBlockTimestamp - reserveTimestamp;
			// bring old record up-to-date, in case there was no cumulative update in provided historic block itself
			if (secondsBetweenReserveUpdateAndHistoricBlock > 0) {
				// TODO: figure out what _demonitationToken means, re: reserve1/reserve0 ratios
				historicPriceCumulativeLast += uint(UQ112x112
					.encode(_demonitationTokenIs0 ? reserve1 : reserve0)
					.uqdiv(_demonitationTokenIs0 ? reserve0 : reserve1)
					) * secondsBetweenReserveUpdateAndHistoricBlock;
			}
		}
		uint256 secondsBetweenProvidedBlockAndNow = block.timestamp - historicBlockTimestamp;
		price = (getCurrentPriceCumulativeLast(_uniswapV2Pair, _demonitationTokenIs0) - historicPriceCumulativeLast) / secondsBetweenProvidedBlockAndNow;
		return (price, blockNumber);
	}

	function getCurrentPriceCumulativeLast(IUniswapV2Pair _uniswapV2Pair, bool _demonitationTokenIs0) public view returns (uint256 priceCumulativeLast) {
		(uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = _uniswapV2Pair.getReserves();
		priceCumulativeLast = _demonitationTokenIs0 ? _uniswapV2Pair.price0CumulativeLast() : _uniswapV2Pair.price1CumulativeLast();
		uint256 timeElapsed = block.timestamp - blockTimestampLast;
		if (timeElapsed > 0) {
			priceCumulativeLast += uint(UQ112x112
				.encode(_demonitationTokenIs0 ? reserve1 : reserve0)
				.uqdiv(_demonitationTokenIs0 ? reserve0 : reserve1)
			) * timeElapsed;
		}
	}
}
