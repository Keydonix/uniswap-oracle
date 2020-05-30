import { rlpEncode, rlpDecode } from './rlp-encoder'
import { stripLeadingZeros, addressToString, unsignedIntegerToUint8Array, uint8ArrayToUnsignedInteger } from './utils'

export interface Proof {
	readonly block: Uint8Array
	readonly accountProofNodesRlp: Uint8Array
	readonly reserveAndTimestampProofNodesRlp: Uint8Array
	readonly priceAccumulatorProofNodesRlp: Uint8Array
}

export type ProofResult = {
	readonly accountProof: readonly Uint8Array[]
	readonly storageProof: readonly {
		readonly key: bigint
		readonly value: bigint
		readonly proof: readonly Uint8Array[]
	}[]
}

export type Block = {
	readonly parentHash: bigint
	readonly sha3Uncles: bigint
	readonly miner: bigint
	readonly stateRoot: bigint
	readonly transactionsRoot: bigint
	readonly receiptsRoot: bigint
	readonly logsBloom: bigint
	readonly difficulty: bigint
	readonly number: bigint
	readonly gasLimit: bigint
	readonly gasUsed: bigint
	readonly timestamp: bigint
	readonly extraData: Uint8Array
	readonly mixHash: bigint | undefined
	readonly nonce: bigint | null
}

export type EthGetStorageAt = (address: bigint, position: bigint, block: bigint | 'latest') => Promise<Uint8Array>
export type EthGetProof = (address: bigint, positions: readonly bigint[], block: bigint) => Promise<ProofResult>
export type EthGetBlockByNumber = (blockNumber: bigint) => Promise<Block | null>

export async function getProof(eth_getStorageAt: EthGetStorageAt, eth_getProof: EthGetProof, eth_getBlockByNumber: EthGetBlockByNumber, exchangeAddress: bigint, denominationToken: bigint, blockNumber: bigint): Promise<Proof> {
	const token0Address = uint8ArrayToUnsignedInteger(await eth_getStorageAt(exchangeAddress, 4n, 'latest'))
	const token1Address = uint8ArrayToUnsignedInteger(await eth_getStorageAt(exchangeAddress, 5n, 'latest'))
	if (denominationToken !== token0Address && denominationToken !== token1Address) throw new Error(`Denomination token ${addressToString(denominationToken)} is not one of the two tokens for the Uniswap exchange at ${exchangeAddress}`)
	const priceAccumulatorSlot = (denominationToken === token0Address) ? 10n : 9n
	const proof = await eth_getProof(exchangeAddress, [8n, priceAccumulatorSlot], blockNumber)
	const block = await eth_getBlockByNumber(blockNumber)
	if (block === null) throw new Error(`Received null for block ${Number(blockNumber)}`)
	const blockRlp = rlpEncodeBlock(block)
	const accountProofNodesRlp = rlpEncode(proof.accountProof.map(rlpDecode))
	const reserveAndTimestampProofNodesRlp = rlpEncode(proof.storageProof[0].proof.map(rlpDecode))
	const priceAccumulatorProofNodesRlp = rlpEncode(proof.storageProof[1].proof.map(rlpDecode))

	return {
		block: blockRlp,
		accountProofNodesRlp,
		reserveAndTimestampProofNodesRlp,
		priceAccumulatorProofNodesRlp,
	}
}

export async function getPrice(eth_getStorageAt: EthGetStorageAt, exchangeAddress: bigint, denominationToken: bigint, blockNumber: number): Promise<bigint> {
	// TODO
	eth_getStorageAt
	exchangeAddress
	denominationToken
	blockNumber

	return 0n
}

function rlpEncodeBlock(block: Block) {
	return rlpEncode([
		unsignedIntegerToUint8Array(block.parentHash, 32),
		unsignedIntegerToUint8Array(block.sha3Uncles, 32),
		unsignedIntegerToUint8Array(block.miner, 20),
		unsignedIntegerToUint8Array(block.stateRoot, 32),
		unsignedIntegerToUint8Array(block.transactionsRoot, 32),
		unsignedIntegerToUint8Array(block.receiptsRoot, 32),
		unsignedIntegerToUint8Array(block.logsBloom, 256),
		stripLeadingZeros(unsignedIntegerToUint8Array(block.difficulty, 32)),
		stripLeadingZeros(unsignedIntegerToUint8Array(block.number, 32)),
		stripLeadingZeros(unsignedIntegerToUint8Array(block.gasLimit, 32)),
		stripLeadingZeros(unsignedIntegerToUint8Array(block.gasUsed, 32)),
		stripLeadingZeros(unsignedIntegerToUint8Array(block.timestamp, 32)),
		stripLeadingZeros(block.extraData),
		...(block.mixHash !== undefined ? [unsignedIntegerToUint8Array(block.mixHash, 32)] : []),
		...(block.nonce !== null && block.nonce !== undefined ? [unsignedIntegerToUint8Array(block.nonce, 8)] : []),
	])
}
