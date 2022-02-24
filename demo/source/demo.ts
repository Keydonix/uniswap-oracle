import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import { PriceEmitter } from './generated/price-emitter'
import { deployAllTheThings } from './deploy-contract'
import { createMnemonicRpc } from './rpc-factories'
import { ethGetBlockByNumber } from './adapters';
import { resetUniswapAndAccount, setPrice } from './uniswap-helpers';

async function main() {
	const gasPrice = 10n * 10n**9n
	const rpc = await createMnemonicRpc('http://localhost:1237', gasPrice)
	const rpcSignerAddress = await rpc.addressProvider()

	const { uniswapExchange, priceEmitter, token0, token1 } = await deployAllTheThings(rpc)

	// seed Uniswap with some liquidity at 1:1 ratio between the two tokens, then cause the price to move to 2:1
	await resetUniswapAndAccount(uniswapExchange, token0, token1, rpcSignerAddress, 1n, 1n)
	await uniswapExchange.sync() // First block with 1:1 price starting
	const blockNumber = await rpc.getBlockNumber() // Grab the first block after the sync is called, new blocks will be at 1:1 ratio from here
	await setPrice(uniswapExchange, token0, token1, 2n, 1n) // So far two blocks at 1:1 price (one transfer, one sync), blocks after this will record 2:1 price
	await uniswapExchange.sync() // First block with 2:1 price

	// get the proof from the SDK
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), uniswapExchange.address, token0.address, blockNumber)

	// call our contract with the proof and inspect the price it witnessed
	const events = await priceEmitter.emitPrice(uniswapExchange.address, token0.address, 4n, 4n, proof)
	const contractPrice = (events.find(x => x.name === 'Price') as PriceEmitter.Price).parameters.price
	// Uniswap oracle prices are binary fixed point numbers with 112 fractional bits, so we convert to floating point here (may suffer rounding errors, use with caution in production)
	console.log(`Contract Price: ${Number(contractPrice) / 2**112}`)

	// ask the SDK for a price estimate as of the latest block, which should match what the SDK said (since it executed in the latest block)
	const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), uniswapExchange.address, token0.address, blockNumber)
	console.log(`SDK Price: ${Number(sdkPrice) / 2**112}`)
}

main().then(() => {
	process.exit(0)
}).catch(error => {
	console.dir(error, { depth: null })
	process.exit(1)
})
