import { SignerFetchRpc } from './rpc-factories'
import { compilerOutput } from '@keydonix/uniswap-oracle'
import { Bytes } from '@zoltu/ethereum-types'
import { keccak256 } from '@zoltu/ethereum-crypto'

async function ensureProxyDeployerDeployed(rpc: SignerFetchRpc): Promise<void> {
	const deployerBytecode = await rpc.getCode(0x7a0d94f55792c434d74a40883c6ed8545e406d12n)
	if (deployerBytecode.equals(Bytes.fromHexString('0x60003681823780368234f58015156014578182fd5b80825250506014600cf3'))) return

	await rpc.sendEth(0x4c8d290a1b368ac4728d83a9e8321fc3af2b39b1n, 10000000000000000n)
	await rpc.sendRawTransaction(Bytes.fromHexString('0xf87e8085174876e800830186a08080ad601f80600e600039806000f350fe60003681823780368234f58015156014578182fd5b80825250506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222'))
}

export async function deployUniswapOracle(rpc: SignerFetchRpc) {
	await ensureProxyDeployerDeployed(rpc)

	const deploymentBytecode = await getUniswapOracleDeploymentBytecode()
	const expectedDeployedBytecode = await getUniswapOracleDeployedBytecode()
	const uniswapOracleAddress = await getUniswapOracleDeploymentAddress()
	const deployedBytecode = await rpc.getCode(uniswapOracleAddress)
	if (deployedBytecode.equals(expectedDeployedBytecode)) return uniswapOracleAddress


	await rpc.sendTransaction({ to: 0x7a0d94f55792c434d74a40883c6ed8545e406d12n, data: deploymentBytecode })
	return uniswapOracleAddress
}

async function getUniswapOracleDeploymentBytecode() {
	const deploymentBytecodeString = compilerOutput.contracts['UniswapOracle.sol']['UniswapOracle'].evm.bytecode.object
	let deploymentBytecode = Bytes.fromHexString(deploymentBytecodeString);

	// TODO: if we end up with constructor inputs, you'll have to do something like this
	// const constructorInputs: readonly ParameterDescription[] = (compilerOutput.contracts['UniswapOracle.sol']['UniswapOracle'].abi.find((x: any) => x.type === 'constructor') || {}).inputs || []
	// const encodedConstructorParameters = encodeParameters(constructorInputs, [0n, 0n, 0n])
	const encodedConstructorParameters = new Bytes()
	const constructorBytecode = Bytes.fromByteArray([...deploymentBytecode, ...encodedConstructorParameters])

	return constructorBytecode
}

async function getUniswapOracleDeployedBytecode() {
	const deployedBytecodeString = compilerOutput.contracts['UniswapOracle.sol']['UniswapOracle'].evm.deployedBytecode.object
	return Bytes.fromHexString(deployedBytecodeString)
}

async function getUniswapOracleDeploymentAddress() {
	const deploymentBytecode = await getUniswapOracleDeploymentBytecode()
	const deployerAddress = 0x7a0d94f55792c434d74a40883c6ed8545e406d12n
	const salt = 0n
	const deploymentBytecodeHash = await keccak256.hash(deploymentBytecode)
	return await keccak256.hash([0xff, ...Bytes.fromUnsignedInteger(deployerAddress, 160), ...Bytes.fromUnsignedInteger(salt, 256), ...Bytes.fromUnsignedInteger(deploymentBytecodeHash, 256)]) & 0xffffffffffffffffffffffffffffffffffffffffn
}
