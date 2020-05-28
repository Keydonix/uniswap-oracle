import { getProof, EthGetProofResult, WireEncodedData, WireEncodedBytes32, WireEncodedQuantity } from '@keydonix/uniswap-oracle-sdk'
import { FetchDependencies, FetchJsonRpc } from '@zoltu/solidity-typescript-generator-fetch-dependencies'
import { PriceEmitter, UniswapV2Factory, TestErc20, UniswapV2Pair } from './generated/price-emitter'
import { deploy } from './deploy-contract'
import { createMemoryRpc, SignerFetchRpc } from './rpc-factories'
import { deployUniswap } from './deploy-uniswap'
import { Crypto } from '@peculiar/webcrypto'
;(global as any).crypto = new Crypto()


async function main() {
	const gasPrice = 10n**9n
	const rpc = await createMemoryRpc('http://localhost:1235', gasPrice)

	const { uniswapExchange, priceEmitter, token0 } = await deployAllTheThings(rpc)

	const denominationTokenAddress = token0.address

	await emitPrice(rpc, priceEmitter, uniswapExchange.address, denominationTokenAddress)
	await sdkGetPrice(rpc, priceEmitter, uniswapExchange.address, denominationTokenAddress)
}

async function emitPrice(rpc: FetchJsonRpc, priceEmitter: PriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
	async function ethGetProof(address: WireEncodedData, positions: WireEncodedBytes32[], block: WireEncodedQuantity): Promise<EthGetProofResult> {
		// TODO: validate input parameters
		const result = await rpc.getProof(BigInt(address), positions.map(BigInt), BigInt(block))
		return {
			balance: `0x${result.balance.toString(16)}`,
			codeHash: `0x${result.codeHash.toString(16).padStart(32, '0')}`,
			nonce: `0x${result.nonce.toString(16)}`,
			storageHash: `0x${result.storageHash.toString(16).padStart(32, '0')}`,
			accountProof: result.accountProof.map(accountProof => accountProof.to0xString()),
			storageProof: result.storageProof.map(storageProof => ({
				key: `0x${storageProof.key.toString(16).padStart(32, '0')}`,
				value: `0x${storageProof.value.toString(16)}`,
				proof: storageProof.proof.map(proof => proof.to0xString())
			})),
		}
	}

	// TODO: get actual values
	const blockNumber = 0

	const proofWireEncoded = await getProof(ethGetProof, uniswapExchangeAddress, denominationTokenAddress, blockNumber)
	const proof = {
		block: hexStringToByteArray(proofWireEncoded.block),
		accountProofNodesRlp: hexStringToByteArray(proofWireEncoded.accountProofNodesRlp),
		reserveAndTimestampProofNodesRlp: hexStringToByteArray(proofWireEncoded.reserveAndTimestampProofNodesRlp),
		priceProofNodesRlp: hexStringToByteArray(proofWireEncoded.priceProofNodesRlp),
	}
	const events = await priceEmitter.emitPrice(uniswapExchangeAddress, denominationTokenAddress, 0n, 255n, proof)
	const priceEvent = events.find(event => event.name === 'Price') as PriceEmitter.Price | undefined
	if (priceEvent === undefined) throw new Error(`Event not emitted.`)
	if (priceEvent.parameters.price !== 0n) throw new Error(`Price not as expected.`)
}

async function sdkGetPrice(rpc: FetchJsonRpc, priceEmitter: PriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
	async function ethGetStorageAt(address: WireEncodedData, position: WireEncodedQuantity, block: WireEncodedQuantity): Promise<WireEncodedBytes32> {
		// TODO: validate input parameters
		const result = await rpc.getStorageAt(BigInt(address), BigInt(position), BigInt(block))
		return result.to0xString()
	}
	ethGetStorageAt
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

function hexStringToByteArray(hex: string) {
	const match = /^(?:0x)?([a-fA-F0-9]*)$/.exec(hex)
	if (match === null) throw new Error(`Expected a hex string encoded byte array with an optional '0x' prefix but received ${hex}`)
	const normalized = match[1]
	if (normalized.length % 2) throw new Error(`Hex string encoded byte array must be an even number of charcaters long.`)
	const bytes = []
	for (let i = 0; i < normalized.length; i += 2) {
		bytes.push(Number.parseInt(`${normalized[i]}${normalized[i + 1]}`, 16))
	}
	return new Uint8Array(bytes)
}

main().then(() => {
	process.exit(0)
}).catch(error => {
	console.error(error)
	process.exit(1)
})
