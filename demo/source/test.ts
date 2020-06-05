import Jasmine = require('jasmine')
const jasmine = new Jasmine({})
jasmine.randomizeTests(false)

import { Crypto } from '@peculiar/webcrypto'
(global as any).crypto = new Crypto()
import fetch from 'node-fetch'

import * as OracleSdk from '@keydonix/uniswap-oracle-sdk'
import { keccak256 } from '@zoltu/ethereum-crypto'
import { rlpDecode, rlpEncode } from '@zoltu/rlp-encoder'
import { createMnemonicRpc } from './rpc-factories'
import { deployAllTheThings } from './deploy-contract'
import { ethGetBlockByNumber } from './adapters'
import { unsignedIntegerToUint8Array, isUint8Array, uint8ArrayToUnsignedInteger } from './utils'
import { UniswapV2Pair, TestErc20 } from './generated/price-emitter'

const jsonRpcEndpoint = 'http://localhost:1237'
const gasPrice = 10n*8n

it('block verifier', async () => {
	const rpc = await createMnemonicRpc(jsonRpcEndpoint, gasPrice)
	const { uniswapExchange, token0, blockVerifierWrapper } = await deployAllTheThings(rpc)

	// get the RLP encoded latest block
	const blockNumber = await rpc.getBlockNumber()
	const block = await rpc.getBlockByNumber(false, blockNumber)
	// use the SDK so we don't have to RLP encode the block ourselves
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), uniswapExchange.address, token0.address, blockNumber)

	// validate in TypeScript
	const rlpBlockHash = await keccak256.hash(proof.block)
	expect(rlpBlockHash).toEqual(block!.hash!)

	// validate in Solidity
	const { stateRoot, blockTimestamp } = await blockVerifierWrapper.extractStateRootAndTimestamp_(proof.block)
	expect(stateRoot).toEqual(block!.stateRoot)
	expect(blockTimestamp).toEqual(BigInt(block!.timestamp.getTime() / 1000))
})

it('account proof', async () => {
	// setup
	const rpc = await createMnemonicRpc(jsonRpcEndpoint, gasPrice)
	const { token0, merklePatriciaVerifierWrapper } = await deployAllTheThings(rpc)

	// get a proof from the latest block
	const blockNumber = await rpc.getBlockNumber()
	const block = await rpc.getBlockByNumber(false, blockNumber)
	const proof = await rpc.getProof(token0.address, [2n], blockNumber)
	const path = await keccak256.hash(unsignedIntegerToUint8Array(token0.address, 20))
	const accountProofNodesRlp = rlpEncode(proof.accountProof.map(rlpDecode))

	// extract the account proof data with solidity
	const accountDetailsRlp = await merklePatriciaVerifierWrapper.getValueFromProof_(block!.stateRoot, path, accountProofNodesRlp)
	const decodedAccountDetails = rlpDecode(accountDetailsRlp)
	if (!Array.isArray(decodedAccountDetails)) throw new Error(`decoded account details is not an array of items as expected`)
	const accountDetails = decodedAccountDetails.filter(isUint8Array).map(uint8ArrayToUnsignedInteger)
	expect(accountDetails[0]).toEqual(proof.nonce)
	expect(accountDetails[1]).toEqual(proof.balance)
	expect(accountDetails[2]).toEqual(proof.storageHash)
	expect(accountDetails[3]).toEqual(proof.codeHash)
})

it('storage proof', async () => {
	// setup
	const rpc = await createMnemonicRpc(jsonRpcEndpoint, gasPrice)
	const { token0, merklePatriciaVerifierWrapper } = await deployAllTheThings(rpc)
	// ensure there is a token supply
	if (await token0.totalSupply_() === 0n) await token0.mint(100n)

	// get a proof from the latest block
	const blockNumber = await rpc.getBlockNumber()
	const storageSlot = 2n
	const path = await keccak256.hash(unsignedIntegerToUint8Array(storageSlot, 32))
	const proof = await rpc.getProof(token0.address, [2n], blockNumber)
	const totalSupplyProofNodesRlp = rlpEncode(proof.storageProof[0].proof.map(rlpDecode))

	// extract the leaf node in Solidity
	const storedDataRlp = await merklePatriciaVerifierWrapper.getValueFromProof_(proof.storageHash, path, totalSupplyProofNodesRlp)
	const storedDataBytes = rlpDecode(storedDataRlp)
	if (!(storedDataBytes instanceof Uint8Array)) throw new Error(`decoded data was not an RLP item`)
	const storedData = uint8ArrayToUnsignedInteger(storedDataBytes)
	expect(storedData).toEqual(await token0.totalSupply_())
})

it('block to storage', async () => {
	// setup
	const rpc = await createMnemonicRpc(jsonRpcEndpoint, gasPrice)
	const { uniswapExchange, token0, blockVerifierWrapper, merklePatriciaVerifierWrapper } = await deployAllTheThings(rpc)
	// ensure there is a token supply
	if (await token0.totalSupply_() === 0n) await token0.mint(100n)

	// get the state root from latest block
	const blockNumber = await rpc.getBlockNumber()
	// use the SDK so we don't have to RLP encode the block ourselves
	const sdkProof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), uniswapExchange.address, token0.address, blockNumber)
	const { stateRoot } = await blockVerifierWrapper.extractStateRootAndTimestamp_(sdkProof.block)

	// get the account storage root from proof
	const proof = await rpc.getProof(token0.address, [2n], blockNumber)
	const accountPath = await keccak256.hash(unsignedIntegerToUint8Array(token0.address, 20))
	const accountProofNodesRlp = rlpEncode(proof.accountProof.map(rlpDecode))
	const accountDetailsRlp = await merklePatriciaVerifierWrapper.getValueFromProof_(stateRoot, accountPath, accountProofNodesRlp)
	const decodedAccountDetails = rlpDecode(accountDetailsRlp)
	if (!Array.isArray(decodedAccountDetails)) throw new Error(`decoded account details is not an array of items as expected`)
	const accountDetails = decodedAccountDetails.filter(isUint8Array).map(uint8ArrayToUnsignedInteger)
	const storageRoot = accountDetails[2]

	// extract the storage value from proof
	const storageSlot = 2n
	const storagePath = await keccak256.hash(unsignedIntegerToUint8Array(storageSlot, 32))
	const totalSupplyProofNodesRlp = rlpEncode(proof.storageProof[0].proof.map(rlpDecode))
	const storedDataRlp = await merklePatriciaVerifierWrapper.getValueFromProof_(storageRoot, storagePath, totalSupplyProofNodesRlp)

	// verify the stored data
	const storedDataBytes = rlpDecode(storedDataRlp)
	if (!(storedDataBytes instanceof Uint8Array)) throw new Error(`decoded data was not an RLP item`)
	const storedData = uint8ArrayToUnsignedInteger(storedDataBytes)
	expect(storedData).toEqual(await token0.totalSupply_())
})

it('oracle proof rlp encoding', async () => {
	// setup
	const rpc = await createMnemonicRpc(jsonRpcEndpoint, gasPrice)
	const rpcSignerAddress = await rpc.addressProvider()
	const { uniswapExchange, token0, token1, merklePatriciaVerifierWrapper } = await deployAllTheThings(rpc)
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

	// ensure there is a token supply
	if (await token0.totalSupply_() === 0n) await token0.mint(100n)
	const blockNumber = await rpc.getBlockNumber()
	const block = await rpc.getBlockByNumber(false, blockNumber)
	const proof = await OracleSdk.getProof(rpc.getStorageAt, rpc.getProof, ethGetBlockByNumber.bind(undefined, rpc), uniswapExchange.address, token0.address, blockNumber)

	const accountPath = await keccak256.hash(unsignedIntegerToUint8Array(uniswapExchange.address, 20))
	const accountRlp = await merklePatriciaVerifierWrapper.getValueFromProof_(block!.stateRoot, accountPath, proof.accountProofNodesRlp)
	const accountTuple = (rlpDecode(accountRlp) as Uint8Array[]).map(uint8ArrayToUnsignedInteger)
	expect(accountTuple[0]).toEqual(await rpc.getTransactionCount(uniswapExchange.address))
	expect(accountTuple[1]).toEqual(await rpc.getBalance(uniswapExchange.address))

	const reservePath = await keccak256.hash(unsignedIntegerToUint8Array(8n, 32))
	const reserveRlp = await merklePatriciaVerifierWrapper.getValueFromProof_(accountTuple[2], reservePath, proof.reserveAndTimestampProofNodesRlp)
	const decodedReserveRlp = rlpDecode(reserveRlp)
	if (!(decodedReserveRlp instanceof Uint8Array)) throw new Error(`decoded reserve and timestamp is not an RLP item as expected`)
	const reserveAndTimestamp = uint8ArrayToUnsignedInteger(decodedReserveRlp)
	const timestamp = reserveAndTimestamp >> (112n + 112n)
	const reserve1 = (reserveAndTimestamp >> 112n) & (2n**112n - 1n)
	const reserve0 = reserveAndTimestamp & (2n**112n - 1n)
	expect(timestamp).toEqual(BigInt(block!.timestamp.getTime() / 1000))
	expect(reserve0).toEqual((await uniswapExchange.getReserves_())._reserve0)
	expect(reserve1).toEqual((await uniswapExchange.getReserves_())._reserve1)

	const token1AccumulatorPath = await keccak256.hash(unsignedIntegerToUint8Array(10n, 32))
	const token1AccumulatorRlp = await merklePatriciaVerifierWrapper.getValueFromProof_(accountTuple[2], token1AccumulatorPath, proof.priceAccumulatorProofNodesRlp)
	const decodedToken1Accumulator = rlpDecode(token1AccumulatorRlp)
	if (!(decodedToken1Accumulator instanceof Uint8Array)) throw new Error(`decoded token1 accumulator is not an RLP item as expected`)
	const token1Accumulator = uint8ArrayToUnsignedInteger(decodedToken1Accumulator)
	expect(token1Accumulator).toEqual(await uniswapExchange.price1CumulativeLast_())
})

it('timestamp', async () => {
	const rpc = await createMnemonicRpc(jsonRpcEndpoint, gasPrice)
	const selfAddress = await rpc.addressProvider()
	const latestBlockTimestamp = (await rpc.getBlockByNumber(false, 'latest'))!.timestamp.getTime() / 1000

	await fetch(`http://localhost:12340/${latestBlockTimestamp + 10}`)
	await rpc.sendEth(selfAddress, 0n)
	const firstBlock = await rpc.getBlockByNumber(false, 'latest')
	expect(firstBlock!.timestamp).toEqual(new Date((latestBlockTimestamp + 10) * 1000))

	await fetch(`http://localhost:12340/${latestBlockTimestamp + 100}`)
	await rpc.sendEth(selfAddress, 0n)
	const secondBlock = await rpc.getBlockByNumber(false, 'latest')
	expect(secondBlock!.timestamp.getTime()).toEqual((latestBlockTimestamp + 100) * 1000)
})

xit('sandbox', async () => {
})

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

jasmine.execute()
