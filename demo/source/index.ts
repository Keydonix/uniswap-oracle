import { getProof, EthGetProofResult, WireEncodedData, WireEncodedBytes32, WireEncodedQuantity } from '@keydonix/uniswap-oracle-sdk'
import { FetchDependencies, FetchJsonRpc } from '@zoltu/solidity-typescript-generator-fetch-dependencies'
import fetch from 'node-fetch'
import { OraclePriceEmitter } from './generated/price-emitter'

async function main() {
	const rpc = new FetchJsonRpc('http://localhost:1235', fetch, {})
	const dependencies = new FetchDependencies(rpc)

	// TODO: deploy oracle price emitter to deterministic address, two tokens, and uniswap exchange
	const oraclePriceEmitterAddress = 0n
	const uniswapExchangeAddress = 0n
	const denominationTokenAddress = 0n
	const oraclePriceEmitter = new OraclePriceEmitter(dependencies, oraclePriceEmitterAddress)

	await emitPrice(rpc, oraclePriceEmitter, uniswapExchangeAddress, denominationTokenAddress)
	await sdkGetPrice(rpc, oraclePriceEmitter, uniswapExchangeAddress, denominationTokenAddress)
}

async function emitPrice(rpc: FetchJsonRpc, oraclePriceEmitter: OraclePriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
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

	const proof = await getProof(ethGetProof, uniswapExchangeAddress, denominationTokenAddress, blockNumber)
	const wireEncodedProof = {
		block: hexStringToByteArray(proof.block),
		accountProofNodesRlp: hexStringToByteArray(proof.accountProofNodesRlp),
		reserveAndTimestampProofNodesRlp: hexStringToByteArray(proof.reserveAndTimestampProofNodesRlp),
		priceProofNodesRlp: hexStringToByteArray(proof.priceProofNodesRlp),
	}
	const events = await oraclePriceEmitter.emitPrice(uniswapExchangeAddress, denominationTokenAddress, 0n, 256n, wireEncodedProof)
	const priceEvent = events.find(event => event.name === 'Price') as OraclePriceEmitter.Price | undefined
	if (priceEvent === undefined) throw new Error(`Event not emitted.`)
	if (priceEvent.parameters.price !== 0n) throw new Error(`Price not as expected.`)
}

async function sdkGetPrice(rpc: FetchJsonRpc, oraclePriceEmitter: OraclePriceEmitter, uniswapExchangeAddress: bigint, denominationTokenAddress: bigint) {
	async function ethGetStorageAt(address: WireEncodedData, position: WireEncodedQuantity, block: WireEncodedQuantity): Promise<WireEncodedBytes32> {
		// TODO: validate input parameters
		const result = await rpc.getStorageAt(BigInt(address), BigInt(position), BigInt(block))
		return result.to0xString()
	}
	ethGetStorageAt
	oraclePriceEmitter
	uniswapExchangeAddress
	denominationTokenAddress
	throw new Error('not implemented')
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
