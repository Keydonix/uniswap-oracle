import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'

type JsonRpcObject = { jsonrpc: '2.0', id: number | string | null, method: string, params?: unknown[] | object }
type EthersProvider = { send: (method: string, params?: unknown[] | object) => Promise<unknown> }
type SendAsyncProvider = { sendAsync: (request: JsonRpcObject, callback: (error: unknown, result: unknown) => void) => Promise<unknown> }
type RequestProvider = { request: (method: string, params?: unknown[] | object) => Promise<unknown> }
type Provider = SendAsyncProvider | RequestProvider | EthersProvider

export function getBlockByNumberFactory(provider: Provider): OracleSdk.EthGetBlockByNumber {
	const requestProvider = normalizeProvider(provider)
	return async (blockNumber: bigint | 'latest') => {
		const stringifiedBlockNumber = typeof blockNumber === 'bigint' ? `0x${blockNumber.toString(16)}` : blockNumber
		const block = await requestProvider.request('eth_getBlockByNumber', [stringifiedBlockNumber, false])
		assertPlainObject(block)
		assertProperty(block, 'parentHash', 'string')
		assertProperty(block, 'sha3Uncles', 'string')
		assertProperty(block, 'miner', 'string')
		assertProperty(block, 'stateRoot', 'string')
		assertProperty(block, 'transactionsRoot', 'string')
		assertProperty(block, 'receiptsRoot', 'string')
		assertProperty(block, 'logsBloom', 'string')
		assertProperty(block, 'difficulty', 'string')
		assertProperty(block, 'number', 'string')
		assertProperty(block, 'gasLimit', 'string')
		assertProperty(block, 'gasUsed', 'string')
		assertProperty(block, 'timestamp', 'string')
		assertProperty(block, 'extraData', 'string')
		assertProperty(block, 'mixHash', 'string')
		assertProperty(block, 'nonce', 'string')
		return {
			parentHash: stringToBigint(block.parentHash),
			sha3Uncles: stringToBigint(block.sha3Uncles),
			miner: stringToBigint(block.miner),
			stateRoot: stringToBigint(block.stateRoot),
			transactionsRoot: stringToBigint(block.transactionsRoot),
			receiptsRoot: stringToBigint(block.receiptsRoot),
			logsBloom: stringToBigint(block.logsBloom),
			difficulty: stringToBigint(block.difficulty),
			number: stringToBigint(block.number),
			gasLimit: stringToBigint(block.gasLimit),
			gasUsed: stringToBigint(block.gasUsed),
			timestamp: stringToBigint(block.timestamp),
			extraData: stringToByteArray(block.extraData),
			mixHash: stringToBigint(block.mixHash),
			nonce: stringToBigint(block.nonce),
		}
	}
}

export function getStorageAtFactory(provider: Provider): OracleSdk.EthGetStorageAt {
	const requestProvider = normalizeProvider(provider)
	return async (address: bigint, position: bigint, block: bigint | 'latest') => {
		const encodedAddress = bigintToHexAddress(address)
		const encodedPosition = bigintToHexQuantity(position)
		const encodedBlockTag = block === 'latest' ? 'latest' : bigintToHexQuantity(block)
		const result = await requestProvider.request('eth_getStorageAt', [encodedAddress, encodedPosition, encodedBlockTag])
		if (typeof result !== 'string') throw new Error(`Expected eth_getStorageAt to return a string but instead returned a ${typeof result}`)
		return stringToBigint(result)
	}
}

export function getProofFactory(provider: Provider): OracleSdk.EthGetProof {
	const requestProvider = normalizeProvider(provider)
	return async (address: bigint, positions: readonly bigint[], block: bigint) => {
		const encodedAddress = bigintToHexAddress(address)
		const encodedPositions = positions.map(bigintToHexQuantity)
		const encodedBlockTag = bigintToHexQuantity(block)
		const result = await requestProvider.request('eth_getProof', [encodedAddress, encodedPositions, encodedBlockTag])
		assertPlainObject(result)
		assertProperty(result, 'accountProof', 'array')
		assertProperty(result, 'storageProof', 'array')
		const accountProof = result.accountProof.map(entry => {
			assertType(entry, 'string')
			return stringToByteArray(entry)
		})
		const storageProof = result.storageProof.map(entry => {
			assertPlainObject(entry)
			assertProperty(entry, 'key', 'string')
			assertProperty(entry, 'value', 'string')
			assertProperty(entry, 'proof', 'array')
			return {
				key: stringToBigint(entry.key),
				value: stringToBigint(entry.key),
				proof: entry.proof.map(proofEntry => {
					assertType(proofEntry, 'string')
					return stringToByteArray(proofEntry)
				})
			}
		})
		return { accountProof, storageProof }
	}
}

function normalizeProvider(provider: Provider): RequestProvider {
	if ('request' in provider) {
		return provider
	} else if('sendAsync' in provider) {
		return {
			request: async (method: string, params?: unknown[] | object) => {
				return new Promise((resolve, reject) => {
					provider.sendAsync({ jsonrpc: '2.0', id: 1, method, params }, (error, response) => {
						if (error !== null && error !== undefined) return reject(unknownErrorToJsonRpcError(error, { request: { method, params } }))
						if (!isJsonRpcLike(response)) return reject(new JsonRpcError(-32000, `Received something other than a JSON-RPC response from provider.sendAsync.`, { request: { method, params }, response}))
						if ('error' in response) return reject(new JsonRpcError(response.error.code, response.error.message, response.error.data))
						return resolve(response.result)
					})
				})
			}
		}
	} else if ('send' in provider) {
		return {
			request: async (method, params) => provider.send(method, params)
		}
	} else {
		throw new Error(`expected an object with a 'request', 'sendAsync' or 'send' method on it but received ${JSON.stringify(provider)}`)
	}
}

export class JsonRpcError extends Error {
	constructor(public readonly code: number, message: string, public readonly data?: unknown) {
		super(message)
		// https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, JsonRpcError.prototype)
	}
}

function unknownErrorToJsonRpcError(error: unknown, extraData: object) {
	if (error instanceof Error) {
		// sketchy, but probably fine
		const mutableError = error as unknown as Record<'code' | 'data', unknown>
		mutableError.code = mutableError.code || -32603
		mutableError.data = mutableError.data || extraData
		if (isPlainObject(mutableError.data)) mergeIn(mutableError.data, extraData)
		return error
	}
	// if someone threw something besides an Error, wrap it up in an error
	return new JsonRpcError(-32603, `Unexpected thrown value.`, mergeIn({ error }, extraData))
}


function mergeIn(target: object, source: object) {
	for (const key in source) {
		const targetValue = (target as any)[key] as unknown
		const sourceValue = (source as any)[key] as unknown
		if (targetValue === undefined || targetValue === null) {
			;(target as any)[key] = sourceValue
		} else if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
			mergeIn(targetValue, sourceValue)
		} else {
			// drop source[key], don't want to override the target value
		}
	}
	return target
}

function isPlainObject(maybe: unknown): maybe is object {
	if (typeof maybe !== 'object') return false
	if (maybe === null) return false
	if (Array.isArray(maybe)) return false
	// classes can get complicated so don't try to merge them.  What does it mean to merge two Promises or two Dates?
	if (Object.getPrototypeOf(maybe) !== Object.prototype) return false
	return true
}

function assertPlainObject(maybe: unknown): asserts maybe is {} {
	if (typeof maybe !== 'object') throw new Error(`Expected an object but received a ${typeof maybe}`)
	if (maybe === null) throw new Error(`Expected an object but received null.`)
	if (Array.isArray(maybe)) throw new Error(`Expected an object but received an array.`)
	if (Object.getPrototypeOf(maybe) !== Object.prototype) throw new Error(`Expected a plain object, but received a class instance.`)
}


type TypeMapping = { 'string': string, 'object': {}, 'array': unknown[] }
function assertType<V extends 'string' | 'object' | 'array'>(maybe: unknown, expectedPropertyType: V): asserts maybe is TypeMapping[V] {
	if (expectedPropertyType === 'string' && typeof maybe === 'string') return
	if (expectedPropertyType === 'array' && Array.isArray(maybe)) return
	if (expectedPropertyType === 'object' && typeof maybe === 'object' && maybe !== null && !Array.isArray(maybe)) return
	throw new Error(`Value is of type ${typeof maybe} instead of expected type ${expectedPropertyType}`)
}
function assertProperty<T extends {}, K extends string, V extends 'string' | 'object' | 'array'>(maybe: T, propertyName: K, expectedPropertyType: V): asserts maybe is T & { [Key in K]: TypeMapping[V] } {
	if (!(propertyName in maybe)) throw new Error(`Object does not contain a ${propertyName} property.`)
	const propertyValue = (maybe as any)[propertyName] as unknown
	// CONSIDER: DRY with `assertType`
	if (expectedPropertyType === 'string' && typeof propertyValue === 'string') return
	if (expectedPropertyType === 'array' && Array.isArray(propertyValue)) return
	if (expectedPropertyType === 'object' && typeof propertyValue === 'object' && propertyValue !== null && !Array.isArray(propertyValue)) return
	throw new Error(`Object.${propertyName} is of type ${typeof propertyValue} instead of expected type ${expectedPropertyType}`)
}

function isJsonRpcLike(maybe: unknown): maybe is { result: unknown } | { error: { code: number, message: string, data?: unknown }} {
	if (typeof maybe !== 'object') return false
	if (maybe === null) return false
	if ('error' in maybe) {
		if (!('code' in maybe)) return false
		if (typeof (maybe as any).code !== 'number') return false
		if (!('message' in maybe)) return false
		if (typeof (maybe as any).message !== 'string') return false
		return true
	}
	if ('result' in maybe) return true
	return false
}

function stringToBigint(hex: string): bigint {
	const match = /^(?:0x)?([a-fA-F0-9]*)$/.exec(hex)
	if (match === null) throw new Error(`Expected a hex string encoded number with an optional '0x' prefix but received ${hex}`)
	const normalized = match[1]
	return BigInt(`0x${normalized}`)
}

function stringToByteArray(hex: string): Uint8Array {
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

function bigintToHexAddress(value: bigint): string {
	return `0x${value.toString(16).padStart(40, '0')}`
}

function bigintToHexQuantity(value: bigint): string {
	return `0x${value.toString(16)}`
}
