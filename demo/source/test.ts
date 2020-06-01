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
	expect(storedData).toEqual(100n)
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
	expect(storedData).toEqual(100n)
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


jasmine.execute()
