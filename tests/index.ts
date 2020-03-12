import Jasmine = require('jasmine')
const jasmine = new Jasmine({})
jasmine.randomizeTests(false)

import { Crypto } from '@peculiar/webcrypto'
(global as any).crypto = new Crypto()

import { deployUniswapOracle, createTestMnemonicRpc, SignerFetchRpc, DependenciesImpl } from '@keydonix/uniswap-oracle-node-dependencies'
import { UniswapOracle } from '../library/output-cjs'

const jsonRpcEndpoint = 'http://localhost:1237'
let aliceRpc: SignerFetchRpc
let bobRpc: SignerFetchRpc
let carolRpc: SignerFetchRpc
let uniswapOracleAddress: bigint

beforeEach(async () => {
	aliceRpc = await createTestMnemonicRpc(jsonRpcEndpoint, 10n**9n, 0)
	bobRpc = await createTestMnemonicRpc(jsonRpcEndpoint, 10n**9n, 1)
	carolRpc = await createTestMnemonicRpc(jsonRpcEndpoint, 10n**9n, 2)
	// TODO: remove the next two lines once bobRpc and carolRpc are used somewhere
	bobRpc
	carolRpc
	uniswapOracleAddress = await deployUniswapOracle(aliceRpc)
})
it('greets', async () => {
	const uniswapOracle = new UniswapOracle(new DependenciesImpl(aliceRpc), uniswapOracleAddress)
	const greeting = await uniswapOracle.greeting_()
	expect(greeting).toEqual('Hello')

})

jasmine.execute()
