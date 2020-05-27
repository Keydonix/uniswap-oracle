export type WireEncodedQuantity = string
export type WireEncodedData = string
export type WireEncodedBytes32 = string

export interface Proof {
	block: WireEncodedData
	accountProofNodesRlp: WireEncodedData
	reserveAndTimestampProofNodesRlp: WireEncodedData
	priceProofNodesRlp: WireEncodedData
}

// TODO: trim this down to only what we *actually* need
export type EthGetProofResult = {
	balance: WireEncodedQuantity
	codeHash: WireEncodedBytes32
	nonce: WireEncodedQuantity
	storageHash: WireEncodedBytes32
	accountProof: WireEncodedData[]
	storageProof: {
		key: WireEncodedBytes32
		value: WireEncodedQuantity
		proof: WireEncodedData[]
	}[]
}
export type EthGetStorageAt = (address: WireEncodedData, position: WireEncodedQuantity, block: WireEncodedQuantity) => Promise<WireEncodedBytes32>
export type EthGetProof = (address: WireEncodedData, positions: WireEncodedBytes32[], block: WireEncodedQuantity) => Promise<EthGetProofResult>

export async function getProof(eth_getProof: EthGetProof, exchangeAddress: bigint, denominationToken: bigint, blockNumber: number): Promise<Proof> {
	// TODO
	eth_getProof
	exchangeAddress
	denominationToken
	blockNumber
	const block = '0x00'
	const accountProofNodesRlp = '0x00'
	const reserveAndTimestampProofNodesRlp = '0x00'
	const priceProofNodesRlp = '0x00'

	return {
		block,
		accountProofNodesRlp,
		reserveAndTimestampProofNodesRlp,
		priceProofNodesRlp,
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
