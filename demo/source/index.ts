import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import fetch from 'node-fetch'
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import { FetchJsonRpc } from '@zoltu/solidity-typescript-generator-fetch-dependencies'
import { PriceEmitter, UniswapV2Pair, TestErc20 } from './generated/price-emitter'
import { deployAllTheThings } from './deploy-contract'
import { createMnemonicRpc } from './rpc-factories'
import { ethGetBlockByNumber } from './adapters';

async function main() {
	const gasPrice = 10n**9n
	const rpc = await createMnemonicRpc('http://localhost:1237', gasPrice)
	const rpcSignerAddress = await rpc.addressProvider()

	const { uniswapExchange, priceEmitter, token0, token1 } = await deployAllTheThings(rpc)

	const denominationTokenAddress = token0.address

	await token0.burn(await token0.balanceOf_(await rpc.addressProvider()))
	await token0.mint(1000n * 10n ** 18n)
	await token1.burn(await token1.balanceOf_(await rpc.addressProvider()))
	await token1.mint(1000n * 10n ** 18n)

	await token0.transfer(uniswapExchange.address, 500n * 10n ** 18n)
	await token1.transfer(uniswapExchange.address, 500n * 10n ** 18n)
	await uniswapExchange.mint(await rpc.addressProvider())
	const latestBlockTimestamp = (await rpc.getBlockByNumber(false, 'latest'))!.timestamp.getTime() / 1000
	await fetch(`http://localhost:12340/${latestBlockTimestamp + 10}`)
	await swap0For1(uniswapExchange, token0, rpcSignerAddress, 10n * 10n**18n)
	await fetch(`http://localhost:12340/${latestBlockTimestamp + 20}`)
	await swap1For0(uniswapExchange, token1, rpcSignerAddress, 10n * 10n**18n)

	await emitPrice(rpc, priceEmitter, uniswapExchange.address, denominationTokenAddress)
	await sdkGetPrice(rpc, priceEmitter, uniswapExchange.address, denominationTokenAddress)
}

async function emitPrice(rpc: FetchJsonRpc, priceEmitter: PriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
	const blockNumber = await rpc.getBlockNumber()
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), uniswapExchangeAddress, denominationTokenAddress, blockNumber)
	const maxBlocksBack = blockNumber > 255n ? 255n : blockNumber
	const events = await priceEmitter.emitPrice(uniswapExchangeAddress, denominationTokenAddress, 0n, maxBlocksBack, proof)
	const priceEvent = events.find(event => event.name === 'Price') as PriceEmitter.Price | undefined
	if (priceEvent === undefined) throw new Error(`Event not emitted.`)
	// TODO: calculate volume weighted average off-chain and compare that to `priceEvent.parameters.price
	// if (priceEvent.parameters.price !== 0n) throw new Error(`Price not as expected.`)
}

async function sdkGetPrice(rpc: FetchJsonRpc, priceEmitter: PriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
	rpc
	priceEmitter
	uniswapExchangeAddress
	denominationTokenAddress
	throw new Error('not implemented')
}

async function swap0For1(uniswapExchange: UniswapV2Pair, token0: TestErc20, recipient: bigint, token0Amount: bigint) {
	const token1Out = await getToken1Out(uniswapExchange, token0Amount)
	await token0.transfer(uniswapExchange.address, token0Amount)
	await uniswapExchange.swap(0n, token1Out, recipient, new Uint8Array())
}

async function swap1For0(uniswapExchange: UniswapV2Pair, token1: TestErc20, recipient: bigint, token1Amount: bigint) {
	const token0Out = await getToken1Out(uniswapExchange, token1Amount)
	await token1.transfer(uniswapExchange.address, token1Amount)
	await uniswapExchange.swap(0n, token0Out, recipient, new Uint8Array())
}

// cribbed from https://github.com/Uniswap/uniswap-v2-periphery/blob/57c3e93e2b979db7590e4b8bb28e7acfa049c192/contracts/libraries/UniswapV2Library.sol#L43-L50
async function getToken1Out(uniswapExchange: UniswapV2Pair, token0In: bigint) {
	const { _reserve0: token0Reserve, _reserve1: token1Reserve } = await uniswapExchange.getReserves_()
	const amountInWithFee = token0In * 997n
	const numerator = amountInWithFee * token1Reserve
	const denominator = token0Reserve * 1000n + amountInWithFee
	const amountOut = numerator / denominator
	return amountOut
}

main().then(() => {
	process.exit(0)
}).catch(error => {
	console.dir(error, { depth: null })
	process.exit(1)
})
