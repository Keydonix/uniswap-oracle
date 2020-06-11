import Jasmine = require('jasmine')
const jasmine = new Jasmine({})
jasmine.randomizeTests(false)

import { Crypto } from '@peculiar/webcrypto'
(global as any).crypto = new Crypto()
import fetch from 'node-fetch'

import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import { keccak256 } from '@zoltu/ethereum-crypto'
import { rlpDecode, rlpEncode } from '@zoltu/rlp-encoder'
import { createMnemonicRpc, SignerFetchRpc } from './rpc-factories'
import { deployAllTheThings } from './deploy-contract'
import { ethGetBlockByNumber } from './adapters'
import { unsignedIntegerToUint8Array, isUint8Array, uint8ArrayToUnsignedInteger } from './utils'
import { resetUniswapAndAccount, mineBlocks, swap0For1, swap1For0, setPrice } from './uniswap-helpers'
import { PriceEmitter } from './generated/price-emitter'

const jsonRpcEndpoint = 'http://localhost:1237'
const gasPrice = 10n*9n

let rpc: SignerFetchRpc
let rpcSignerAddress: bigint
let contracts: ReturnType<typeof deployAllTheThings> extends Promise<infer T> ? T : never
beforeAll(async () => {
	rpc = await createMnemonicRpc(jsonRpcEndpoint, gasPrice)
	rpcSignerAddress = await rpc.addressProvider()
	contracts = await deployAllTheThings(rpc)
})

it('block verifier', async () => {
	// get the RLP encoded latest block
	const blockNumber = await rpc.getBlockNumber()
	const block = await rpc.getBlockByNumber(false, blockNumber)
	// use the SDK so we don't have to RLP encode the block ourselves
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)

	// validate in TypeScript
	const rlpBlockHash = await keccak256.hash(proof.block)
	expect(rlpBlockHash).toEqual(block!.hash!)

	// validate in Solidity
	const { stateRoot, blockTimestamp } = await contracts.blockVerifierWrapper.extractStateRootAndTimestamp_(proof.block)
	expect(stateRoot).toEqual(block!.stateRoot)
	expect(blockTimestamp).toEqual(BigInt(block!.timestamp.getTime() / 1000))
})

it('account proof', async () => {
	// get a proof from the latest block
	const blockNumber = await rpc.getBlockNumber()
	const block = await rpc.getBlockByNumber(false, blockNumber)
	const proof = await rpc.getProof(contracts.token0.address, [2n], blockNumber)
	const path = await keccak256.hash(unsignedIntegerToUint8Array(contracts.token0.address, 20))
	const accountProofNodesRlp = rlpEncode(proof.accountProof.map(rlpDecode))

	// extract the account proof data with solidity
	const accountDetailsRlp = await contracts.merklePatriciaVerifierWrapper.getValueFromProof_(block!.stateRoot, path, accountProofNodesRlp)
	const decodedAccountDetails = rlpDecode(accountDetailsRlp)
	if (!Array.isArray(decodedAccountDetails)) throw new Error(`decoded account details is not an array of items as expected`)
	const accountDetails = decodedAccountDetails.filter(isUint8Array).map(uint8ArrayToUnsignedInteger)
	expect(accountDetails[0]).toEqual(proof.nonce)
	expect(accountDetails[1]).toEqual(proof.balance)
	expect(accountDetails[2]).toEqual(proof.storageHash)
	expect(accountDetails[3]).toEqual(proof.codeHash)
})

it('storage proof', async () => {
	// ensure there is a token supply
	if (await contracts.token0.totalSupply_() === 0n) await contracts.token0.mint(100n)

	// get a proof from the latest block
	const blockNumber = await rpc.getBlockNumber()
	const storageSlot = 2n
	const path = await keccak256.hash(unsignedIntegerToUint8Array(storageSlot, 32))
	const proof = await rpc.getProof(contracts.token0.address, [2n], blockNumber)
	const totalSupplyProofNodesRlp = rlpEncode(proof.storageProof[0].proof.map(rlpDecode))

	// extract the leaf node in Solidity
	const storedDataRlp = await contracts.merklePatriciaVerifierWrapper.getValueFromProof_(proof.storageHash, path, totalSupplyProofNodesRlp)
	const storedDataBytes = rlpDecode(storedDataRlp)
	if (!(storedDataBytes instanceof Uint8Array)) throw new Error(`decoded data was not an RLP item`)
	const storedData = uint8ArrayToUnsignedInteger(storedDataBytes)
	expect(storedData).toEqual(await contracts.token0.totalSupply_())
})

it('block to storage', async () => {
	// ensure there is a token supply
	if (await contracts.token0.totalSupply_() === 0n) await contracts.token0.mint(100n)

	// get the state root from latest block
	const blockNumber = await rpc.getBlockNumber()
	// use the SDK so we don't have to RLP encode the block ourselves
	const sdkProof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const { stateRoot } = await contracts.blockVerifierWrapper.extractStateRootAndTimestamp_(sdkProof.block)

	// get the account storage root from proof
	const proof = await rpc.getProof(contracts.token0.address, [2n], blockNumber)
	const accountPath = await keccak256.hash(unsignedIntegerToUint8Array(contracts.token0.address, 20))
	const accountProofNodesRlp = rlpEncode(proof.accountProof.map(rlpDecode))
	const accountDetailsRlp = await contracts.merklePatriciaVerifierWrapper.getValueFromProof_(stateRoot, accountPath, accountProofNodesRlp)
	const decodedAccountDetails = rlpDecode(accountDetailsRlp)
	if (!Array.isArray(decodedAccountDetails)) throw new Error(`decoded account details is not an array of items as expected`)
	const accountDetails = decodedAccountDetails.filter(isUint8Array).map(uint8ArrayToUnsignedInteger)
	const storageRoot = accountDetails[2]

	// extract the storage value from proof
	const storageSlot = 2n
	const storagePath = await keccak256.hash(unsignedIntegerToUint8Array(storageSlot, 32))
	const totalSupplyProofNodesRlp = rlpEncode(proof.storageProof[0].proof.map(rlpDecode))
	const storedDataRlp = await contracts.merklePatriciaVerifierWrapper.getValueFromProof_(storageRoot, storagePath, totalSupplyProofNodesRlp)

	// verify the stored data
	const storedDataBytes = rlpDecode(storedDataRlp)
	if (!(storedDataBytes instanceof Uint8Array)) throw new Error(`decoded data was not an RLP item`)
	const storedData = uint8ArrayToUnsignedInteger(storedDataBytes)
	expect(storedData).toEqual(await contracts.token0.totalSupply_())
})

it('oracle proof rlp encoding', async () => {
	// setup
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 1n, 1n)
	await contracts.uniswapExchange.sync()

	const latestBlockTimestamp = (await rpc.getBlockByNumber(false, 'latest'))!.timestamp.getTime() / 1000
	await fetch(`http://localhost:12340/${latestBlockTimestamp + 10}`)
	await swap0For1(contracts.uniswapExchange, contracts.token0, rpcSignerAddress, 10n * 10n**18n)
	await fetch(`http://localhost:12340/${latestBlockTimestamp + 20}`)
	await swap1For0(contracts.uniswapExchange, contracts.token1, rpcSignerAddress, 10n * 10n**18n)

	// ensure there is a token supply
	if (await contracts.token0.totalSupply_() === 0n) await contracts.token0.mint(100n)
	const blockNumber = await rpc.getBlockNumber()
	const block = await rpc.getBlockByNumber(false, blockNumber)
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)

	const accountPath = await keccak256.hash(unsignedIntegerToUint8Array(contracts.uniswapExchange.address, 20))
	const accountRlp = await contracts.merklePatriciaVerifierWrapper.getValueFromProof_(block!.stateRoot, accountPath, proof.accountProofNodesRlp)
	const accountTuple = (rlpDecode(accountRlp) as Uint8Array[]).map(uint8ArrayToUnsignedInteger)
	expect(accountTuple[0]).toEqual(await rpc.getTransactionCount(contracts.uniswapExchange.address))
	expect(accountTuple[1]).toEqual(await rpc.getBalance(contracts.uniswapExchange.address))

	const reservePath = await keccak256.hash(unsignedIntegerToUint8Array(8n, 32))
	const reserveRlp = await contracts.merklePatriciaVerifierWrapper.getValueFromProof_(accountTuple[2], reservePath, proof.reserveAndTimestampProofNodesRlp)
	const decodedReserveRlp = rlpDecode(reserveRlp)
	if (!(decodedReserveRlp instanceof Uint8Array)) throw new Error(`decoded reserve and timestamp is not an RLP item as expected`)
	const reserveAndTimestamp = uint8ArrayToUnsignedInteger(decodedReserveRlp)
	const timestamp = reserveAndTimestamp >> (112n + 112n)
	const reserve1 = (reserveAndTimestamp >> 112n) & (2n**112n - 1n)
	const reserve0 = reserveAndTimestamp & (2n**112n - 1n)
	expect(timestamp).toEqual(BigInt(block!.timestamp.getTime() / 1000))
	expect(reserve0).toEqual((await contracts.uniswapExchange.getReserves_())._reserve0)
	expect(reserve1).toEqual((await contracts.uniswapExchange.getReserves_())._reserve1)

	const token1AccumulatorPath = await keccak256.hash(unsignedIntegerToUint8Array(10n, 32))
	const token1AccumulatorRlp = await contracts.merklePatriciaVerifierWrapper.getValueFromProof_(accountTuple[2], token1AccumulatorPath, proof.priceAccumulatorProofNodesRlp)
	const decodedToken1Accumulator = rlpDecode(token1AccumulatorRlp)
	if (!(decodedToken1Accumulator instanceof Uint8Array)) throw new Error(`decoded token1 accumulator is not an RLP item as expected`)
	const token1Accumulator = uint8ArrayToUnsignedInteger(decodedToken1Accumulator)
	expect(token1Accumulator).toEqual(await contracts.uniswapExchange.price1CumulativeLast_())
})

it('timestamp', async () => {
	const latestBlockTimestamp = (await rpc.getBlockByNumber(false, 'latest'))!.timestamp.getTime() / 1000

	await fetch(`http://localhost:12340/${latestBlockTimestamp + 10}`)
	await rpc.sendEth(rpcSignerAddress, 0n)
	const firstBlock = await rpc.getBlockByNumber(false, 'latest')
	expect(firstBlock!.timestamp).toEqual(new Date((latestBlockTimestamp + 10) * 1000))

	await fetch(`http://localhost:12340/${latestBlockTimestamp + 100}`)
	await rpc.sendEth(rpcSignerAddress, 0n)
	const secondBlock = await rpc.getBlockByNumber(false, 'latest')
	expect(secondBlock!.timestamp.getTime()).toEqual((latestBlockTimestamp + 100) * 1000)
})

// TODO: deal with Geth's timestamp issue: https://github.com/ethereum/go-ethereum/issues/21184
describe('oracle vs contract price check', () => {
	const testVectorsRaw = [
		[1n, 1n],
		[1n, 2n],
		[2n, 1n],
	] as const
	const testVectors = testVectorsRaw.map(pair => ({ denominationTokenMultiplier: pair[0], nonDenominationTokenMultiplier: pair[1] }))
	for (const { denominationTokenMultiplier, nonDenominationTokenMultiplier } of testVectors) {
		it(`expect price ${Number(denominationTokenMultiplier)/Number(nonDenominationTokenMultiplier)}`, async () => {
			// setup
			const denominationToken = contracts.token0
			await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, denominationTokenMultiplier, nonDenominationTokenMultiplier)
			const blockNumber = await rpc.getBlockNumber()
			await mineBlocks(rpc, 10)
			await contracts.uniswapExchange.sync()

			const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, denominationToken.address, blockNumber)
			const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, denominationToken.address, blockNumber)
			const { price: contractPrice } = await contracts.priceEmitter.emitPrice_(contracts.uniswapExchange.address, denominationToken.address, 12n, 12n, proof)
			expect(sdkPrice).toEqual(denominationTokenMultiplier * 2n**112n / nonDenominationTokenMultiplier)
			expect(contractPrice).toEqual(sdkPrice)
		})
	}
})

it('one trade, sync before and after', async () => {
	// setup
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 1n, 1n)
	await swap0For1(contracts.uniswapExchange, contracts.token0, rpcSignerAddress, 10n**18n)
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 2n, 1n)
	await contracts.uniswapExchange.sync()
	const blockNumber = await rpc.getBlockNumber()
	await mineBlocks(rpc, 10)
	await contracts.uniswapExchange.sync()

	const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const { price: contractPrice } = await contracts.priceEmitter.emitPrice_(contracts.uniswapExchange.address, contracts.token0.address, 12n, 12n, proof)
	expect(contractPrice).toEqual(sdkPrice)
})

it('no trades, no sync', async () => {
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 1n, 1n)
	await mineBlocks(rpc, 1)
	const blockNumber = await rpc.getBlockNumber()
	await mineBlocks(rpc, 10)

	const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const { price: contractPrice } = await contracts.priceEmitter.emitPrice_(contracts.uniswapExchange.address, contracts.token0.address, 11n, 11n, proof)

	expect(contractPrice).toEqual(2n**112n)
	expect(sdkPrice).toEqual(2n**112n)
})

it('no trades, sync before', async () => {
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 1n, 1n)
	await contracts.uniswapExchange.sync()
	const blockNumber = await rpc.getBlockNumber()
	await mineBlocks(rpc, 10)

	const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const { price: contractPrice } = await contracts.priceEmitter.emitPrice_(contracts.uniswapExchange.address, contracts.token0.address, 11n, 11n, proof)

	expect(contractPrice).toEqual(2n**112n)
	expect(sdkPrice).toEqual(2n**112n)
})

it('no trades, sync after', async () => {
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 1n, 1n)
	await mineBlocks(rpc, 1)
	const blockNumber = await rpc.getBlockNumber()
	await mineBlocks(rpc, 9)
	await contracts.uniswapExchange.sync()

	const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const { price: contractPrice } = await contracts.priceEmitter.emitPrice_(contracts.uniswapExchange.address, contracts.token0.address, 11n, 11n, proof)

	expect(contractPrice).toEqual(2n**112n)
	expect(sdkPrice).toEqual(2n**112n)
})

it('no trades, sync before/after', async () => {
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 1n, 1n)
	await contracts.uniswapExchange.sync()
	const blockNumber = await rpc.getBlockNumber()
	await mineBlocks(rpc, 9)
	await contracts.uniswapExchange.sync()

	const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const { price: contractPrice } = await contracts.priceEmitter.emitPrice_(contracts.uniswapExchange.address, contracts.token0.address, 11n, 11n, proof)

	expect(contractPrice).toEqual(2n**112n)
	expect(sdkPrice).toEqual(2n**112n)
})

fit('one trade', async () => {
	await resetUniswapAndAccount(contracts.uniswapExchange, contracts.token0, contracts.token1, rpcSignerAddress, 1n, 1n)
	const blockNumber = await rpc.getBlockNumber() // block where liquidity was minted, implicit sync call, price is 1:1 at the end of this block
	await setPrice(contracts.uniswapExchange, contracts.token0, contracts.token1, 2n, 1n) // one block at 1:1 price, followed by a block with a sync call in it and 2:1 price at end
	await contracts.uniswapExchange.sync() // block with 2:1 price for full duration and sync included

	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)
	const events = await contracts.priceEmitter.emitPrice(contracts.uniswapExchange.address, contracts.token0.address, 4n, 4n, proof)
	const contractPrice = (events.find(x => x.name === 'Price') as PriceEmitter.Price).parameters.price
	const sdkPrice = await OracleSdk.getPrice(rpc.getStorageAt, ethGetBlockByNumber.bind(undefined, rpc), contracts.uniswapExchange.address, contracts.token0.address, blockNumber)

	expect(sdkPrice).toBe(2n**112n * 3n / 2n, `sdk price wrong: ~${Number(sdkPrice / 2n**80n) / 2**32}`)
	expect(contractPrice).toBe(2n**112n * 3n / 2n, `contract price wrong: ~${Number(contractPrice / 2n**80n) / 2**32}`)
})

jasmine.execute()
