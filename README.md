# uniswap-oracle
A general purpose price feed oracle built on Uniswap v2 that supports arbitrary time windows (up to 256 blocks) and doesn't require any active maintenance.

## 🎊 Finally, an on-chain trustless and censorship resistant oracle! 🎉
Unlike other Uniswap v2 based oracles, this one does not require regular maintenance by either an altruistic or incentivized party.  Anyone with access to an Ethereum node can generate a proof of Uniswap's storage from up to 256 blocks ago and submit it for on-chain validation.  You can then use that validated proof to calculate the average price between the current block and the supplied proof's block so you are protected from short-term price manipulation.

## Community/Support
[![Discord](https://img.shields.io/discord/516762394547060756?label=Discord&style=plastic)](https://discord.gg/cM9A5v8)
[![Twitter Follow](https://img.shields.io/twitter/follow/keydonix?style=social)](https://twitter.com/keydonix)

## In the News
https://medium.com/@epheph/using-uniswap-v2-oracle-with-storage-proofs-3530e699e1d3

## Usage
```
npm install @keydonix/uniswap-oracle-contracts @keydonix/uniswap-oracle-sdk
```
Optionally:
```
npm install @keydonix/uniswap-oracle-sdk-adapter
```
See a fully functional example in `demo/contracts/PriceEmitter.sol` and `demo/source/demo.ts`.  Documentation here is a bit terse because the example is so small that it is probably easier to just read it!
```solidity
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { UniswapOracle } from  '@Keydonix/uniswap-oracle-contracts/source/UniswapOracle.sol';
import { IUniswapV2Pair } from "@Keydonix/uniswap-oracle-contracts/source/IUniswapV2Pair.sol";

contract PriceEmitter is UniswapOracle {
	event Price(uint256 price);

	function emitPrice(IUniswapV2Pair exchange, address denominationToken, uint8 minBlocksBack, uint8 maxBlocksBack, UniswapOracle.ProofData memory proofData) public returns (uint256 price, uint256 blockNumber) {
		(price, blockNumber) = getPrice(exchange, denominationToken, minBlocksBack, maxBlocksBack, proofData);
		emit Price(price);
	}
}
```
```ts
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import * as OracleSdkAdapter from '@keydonix/uniswap-oracle-sdk-adapter'

// create the getters the SDK needs from an Ethereum instance off the window.  you could use `window.web3.currentProvider` instead of `window.ethereum` if that is what is available
const getStorageAt = OracleSdkAdapter.getStorageAtFactory(window.ethereum)
const getProof = OracleSdkAdapter.getProofFactory(window.ethereum)
const getBlockByNumber = OracleSdkAdapter.getBlockByNumberFactory(window.ethereum)

// estimate the moving average price off-chain for presentation in your UI
const estimatedPrice = OracleSdk.getPrice(getStorageAt, getblockByNumber, uniswapExchangeAddress, denominationTokenAddress, blockNumber)

// get the proof from the SDK
const proof = await OracleSdk.getProof(getStorageAt, getProof, getBlockByNumber, uniswapExchangeAddress, denominationTokenAddress, blockNumber)

// inside this contract call we'll have trustless access to a Uniswap average price between `blockNumber` and `currentBlockNumber`
await priceEmitter.emitPrice(uniswapExchangeAddress, denominationTokenAddress, minBlocksBackAllowed, maxBlocksBackAllowed, proof)
```

## Developing
### Tool Requirements
NodeJS, NPM, Docker
#### Optional
VSCode (life is simpler with this, but not required)

### VSCode
If you are using VSCode, you can run `npm install` in each directory (one time operation) and then `Tasks Run Task > all the things` to bootstrap everything.  From there you can `Debug: Select and Start Debugging > run demo` or `Debug: Select and Start Debugging > run tests`.

### Building
#### Contracts
These are published to NPM as-is, demo project compiles and tests them.
#### SDK
```
cd sdk
npm install # one time

npm run build
```
#### SDK Adapter
```
cd sdk-adapter
npm install # one time

npm run build
```
#### Demo
_Depends on Contracts and SDK_
```
cd demo
npm install # one time

npm run build # compiles contracts
```

### Running
```
cd demo
docker-compose up --force-recreate --always-recreate-deps --abort-on-container-exit --remove-orphans --renew-anon-volumes
npm run demo
```

### Testing
```
cd demo
docker-compose up --force-recreate --always-recreate-deps --abort-on-container-exit --remove-orphans --renew-anon-volumes
npm run test
```
