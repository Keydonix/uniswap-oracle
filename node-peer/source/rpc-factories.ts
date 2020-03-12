import fetch from 'node-fetch'
import { FetchJsonRpc } from '@zoltu/ethereum-fetch-json-rpc'
import { MnemonicSigner, PrivateKeySigner } from './signers'

type PartiallyRequired<T, TKeys extends keyof T> = { [P in keyof T]: T[P] } & { [P in TKeys]-?: T[P] }
export type SignerFetchRpc = PartiallyRequired<FetchJsonRpc, 'addressProvider' | 'signatureProvider'>

export async function createMnemonicRpc(jsonRpcHttpEndpoint: string, mnemonicWords: string | string[], gasPrice: bigint, index?: number) {
	mnemonicWords = (typeof mnemonicWords === 'string') ? mnemonicWords.split(' ') : mnemonicWords
	const signer = await MnemonicSigner.create(mnemonicWords, index)
	const gasPriceInAttoethProvider = async () => gasPrice
	const addressProvider = async () => signer.address
	const signatureProvider = signer.sign
	return new FetchJsonRpc(jsonRpcHttpEndpoint, fetch, { gasPriceInAttoethProvider, addressProvider, signatureProvider }) as SignerFetchRpc
}

export async function createMemoryRpc(jsonRpcHttpEndpoint: string, privateKey: bigint, gasPrice: bigint) {
	const signer = await PrivateKeySigner.create(privateKey)
	const gasPriceInAttoethProvider = async () => gasPrice
	const addressProvider = async () => signer.address
	const signatureProvider = signer.sign
	return new FetchJsonRpc(jsonRpcHttpEndpoint, fetch, { gasPriceInAttoethProvider, addressProvider, signatureProvider }) as SignerFetchRpc
}

export async function createTestMnemonicRpc(jsonRpcHttpEndpoint: string, gasPrice: bigint, index?: number) {
	// address 0: 0xfc2077CA7F403cBECA41B1B0F62D91B5EA631B5E (default)
	// address 1: 0xd1a7451beB6FE0326b4B78e3909310880B781d66
	// address 2: 0x578270B5E5B53336baC354756b763b309eCA90Ef
	return await createMnemonicRpc(jsonRpcHttpEndpoint, 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong', gasPrice, index)
}

export async function createTestMemoryRpc(jsonRpcHttpEndpoint: string, gasPrice: bigint) {
	// address: 0x913dA4198E6bE1D5f5E4a40D0667f70C0B5430Ebn
	return await createMemoryRpc(jsonRpcHttpEndpoint, 0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5an, gasPrice)
}
