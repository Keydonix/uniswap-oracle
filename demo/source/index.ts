import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import { FetchJsonRpc } from '@zoltu/solidity-typescript-generator-fetch-dependencies'
import { PriceEmitter } from './generated/price-emitter'
import { deployAllTheThings } from './deploy-contract'
import { createMnemonicRpc } from './rpc-factories'
import { ethGetBlockByNumber } from './adapters';

async function main() {
	const gasPrice = 10n**9n
	const rpc = await createMnemonicRpc('http://localhost:1237', gasPrice)

	const { uniswapExchange, priceEmitter, token0 } = await deployAllTheThings(rpc)

	const denominationTokenAddress = token0.address

	await emitPrice(rpc, priceEmitter, uniswapExchange.address, denominationTokenAddress)
	await sdkGetPrice(rpc, priceEmitter, uniswapExchange.address, denominationTokenAddress)
}

async function emitPrice(rpc: FetchJsonRpc, priceEmitter: PriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
	const blockNumber = await rpc.getBlockNumber()
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), uniswapExchangeAddress, denominationTokenAddress, blockNumber)
	const events = await priceEmitter.emitPrice(uniswapExchangeAddress, denominationTokenAddress, 0n, 255n, proof)
	const priceEvent = events.find(event => event.name === 'Price') as PriceEmitter.Price | undefined
	if (priceEvent === undefined) throw new Error(`Event not emitted.`)
	if (priceEvent.parameters.price !== 0n) throw new Error(`Price not as expected.`)
}

async function sdkGetPrice(rpc: FetchJsonRpc, priceEmitter: PriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
	rpc
	priceEmitter
	uniswapExchangeAddress
	denominationTokenAddress
	throw new Error('not implemented')
}

main().then(() => {
	process.exit(0)
}).catch(error => {
	console.dir(error, { depth: null })
	process.exit(1)
})
