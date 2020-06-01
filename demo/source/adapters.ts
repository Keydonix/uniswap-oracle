import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import { FetchJsonRpc } from '@zoltu/solidity-typescript-generator-fetch-dependencies'

export async function ethGetBlockByNumber(rpc: FetchJsonRpc, blockNumber: bigint): Promise<OracleSdk.Block | null> {
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
