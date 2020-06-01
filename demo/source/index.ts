import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()
import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import { FetchDependencies, FetchJsonRpc } from '@zoltu/solidity-typescript-generator-fetch-dependencies'
import { PriceEmitter, UniswapV2Factory, TestErc20, UniswapV2Pair } from './generated/price-emitter'
import { deploy } from './deploy-contract'
import { createMemoryRpc, SignerFetchRpc } from './rpc-factories'
import { deployUniswap } from './deploy-uniswap'


async function main() {
	const gasPrice = 10n**9n
	const rpc = await createMemoryRpc('http://localhost:1237', gasPrice)

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

async function deployAllTheThings(rpc: SignerFetchRpc) {
	const dependencies = new FetchDependencies(rpc)
	const uniswapFactoryAddress = await deployUniswap(rpc)
	const priceEmitterAddress = await deploy(rpc, 'PriceEmitter.sol', 'PriceEmitter')
	const appleTokenAddress = await deploy(rpc, 'TestErc20.sol', 'TestErc20', ['string', 'string'], ['APPL', 'Apple'])
	const bananaTokenAddress = await deploy(rpc, 'TestErc20.sol', 'TestErc20', ['string', 'string'], ['BNNA', 'Banana'])
	const uniswapFactory = new UniswapV2Factory(dependencies, uniswapFactoryAddress)
	async function getOrCreatePair() {
		const pairAddress = await uniswapFactory.getPair_(appleTokenAddress, bananaTokenAddress)
		if (pairAddress !== 0n) return new UniswapV2Pair(dependencies, pairAddress)
		const events = await uniswapFactory.createPair(appleTokenAddress, bananaTokenAddress)
		const pairCreatedEvent = events.find(event => event.name === 'PairCreated') as UniswapV2Factory.PairCreated | undefined
		if (pairCreatedEvent === undefined) throw new Error(`PairCreated event not found in UniswapFactory.createPair(...) transaction.`)
		return new UniswapV2Pair(dependencies, pairCreatedEvent.parameters.pair)
	}
	const uniswapExchange = await getOrCreatePair()
	const token0 = new TestErc20(dependencies, await uniswapExchange.token0_())
	const token1 = new TestErc20(dependencies, await uniswapExchange.token1_())
	const priceEmitter = new PriceEmitter(dependencies, priceEmitterAddress)

	return {
		uniswapFactory,
		uniswapExchange,
		priceEmitter,
		token0,
		token1,
	} as const
}

async function ethGetBlockByNumber(rpc: FetchJsonRpc, blockNumber: bigint): Promise<OracleSdk.Block | null> {
	const result = await rpc.getBlockByNumber(false, blockNumber)
	if (result === null) throw new Error(`Unknown block number ${blockNumber}`)
	if (result.logsBloom === null) throw new Error(`Block ${blockNumber} was missing 'logsBloom' field.`)
	if (result.number === null) throw new Error(`Block ${blockNumber} was missing 'number' field.`)
	return {
		...result,
		logsBloom: result.logsBloom,
		number: result.number,
		timestamp: BigInt(result.timestamp.getTime() / 1000),
		mixHash: result.mixHash !== null ? result.mixHash : undefined,
	}
}

main().then(() => {
	process.exit(0)
}).catch(error => {
	console.dir(error, { depth: null })
	process.exit(1)
})
