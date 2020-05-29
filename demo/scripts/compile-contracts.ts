import { promises as filesystem } from 'fs'
import * as path from 'path'
import { CompilerOutput, CompilerInput, compile } from 'solc'
import { generateContractInterfaces } from '@zoltu/solidity-typescript-generator'
import { uniswapCompilerOutput } from './uniswap-compiler-output'

const outputFileNamePrefix = 'price-emitter'
const sourceFiles = [
	{ key: '@Keydonix/UniswapOracle.sol', path: 'node_modules/@keydonix/uniswap-oracle-contracts/source/UniswapOracle.sol' },
	{ key: '@Keydonix/IUniswapV2Pair.sol', path: 'node_modules/@keydonix/uniswap-oracle-contracts/source/IUniswapV2Pair.sol' },
	{ key: '@Keydonix/BlockVerifier.sol', path: 'node_modules/@keydonix/uniswap-oracle-contracts/source/BlockVerifier.sol' },
	{ key: '@Keydonix/MerklePatriciaVerifier.sol', path: 'node_modules/@keydonix/uniswap-oracle-contracts/source/MerklePatriciaVerifier.sol' },
	{ key: '@Keydonix/Rlp.sol', path: 'node_modules/@keydonix/uniswap-oracle-contracts/source/Rlp.sol' },
	{ key: '@Keydonix/UQ112x112.sol', path: 'node_modules/@keydonix/uniswap-oracle-contracts/source/UQ112x112.sol' },
	{ key: 'PriceEmitter.sol', path: 'contracts/PriceEmitter.sol' },
	{ key: 'TestErc20.sol', path: 'contracts/TestErc20.sol' },
]
const destinationRootPath = path.join(__dirname, '..', 'source', 'generated')

export async function ensureDirectoryExists(absoluteDirectoryPath: string) {
	try {
		await filesystem.mkdir(absoluteDirectoryPath)
	} catch (error) {
		if (error.code === 'EEXIST') return
		throw error
	}
}

function resolveRelativeContractPath(fileName: string) {
	return path.join(__dirname, '..', fileName)
}

async function compileContracts(): Promise<[CompilerInput, CompilerOutput]> {
	let sources: Record<string, { content: string }> = {}
	for (const sourceFile of sourceFiles) {
		const absolutePath = resolveRelativeContractPath(sourceFile.path)
		const content = await filesystem.readFile(absolutePath, 'utf8')
		sources[sourceFile.key] = { content }
	}

	const compilerInput: CompilerInput = {
		language: "Solidity",
		settings: {
			optimizer: {
				enabled: true,
				runs: 500
			},
			outputSelection: {
				"*": {
					'*': [ 'abi', 'metadata', 'evm.bytecode.object', 'evm.bytecode.sourceMap', 'evm.deployedBytecode.object', 'evm.gasEstimates', 'evm.methodIdentifiers' ]
				}
			}
		},
		sources
	}

	const compilerInputJson = JSON.stringify(compilerInput)
	const compilerOutputJson = compile(compilerInputJson)
	const compilerOutput = JSON.parse(compilerOutputJson) as CompilerOutput
	const errors = compilerOutput.errors
	if (errors) {
		let concatenatedErrors = "";

		for (let error of errors) {
			if (error.message === 'SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.') continue
			concatenatedErrors += error.formattedMessage + "\n";
		}

		if (concatenatedErrors.length > 0) {
			throw new Error("The following errors/warnings were returned by solc:\n\n" + concatenatedErrors);
		}
	}

	return [compilerInput, compilerOutput]
}

async function writeCompilerInput(input: CompilerInput) {
	await ensureDirectoryExists(destinationRootPath)
	const filePath = path.join(destinationRootPath, `${outputFileNamePrefix}-input.json`)
	const fileContents = JSON.stringify(input, undefined, '\t')
	return await filesystem.writeFile(filePath, fileContents, { encoding: 'utf8', flag: 'w' })
}

async function writeCompilerOutput(output: CompilerOutput) {
	await ensureDirectoryExists(destinationRootPath)
	const filePath = path.join(destinationRootPath, `${outputFileNamePrefix}-output.json`)
	const fileContents = JSON.stringify(output, undefined, '\t')
	return await filesystem.writeFile(filePath, fileContents, { encoding: 'utf8', flag: 'w' })
}

async function writeGeneratedInterface(compilerOutput: CompilerOutput, filename: string) {
	const filePath = path.join(destinationRootPath, `${filename}.ts`)
	await ensureDirectoryExists(path.dirname(filePath))
	const fileContents = await generateContractInterfaces(compilerOutput)
	await filesystem.writeFile(filePath, fileContents, { encoding: 'utf8', flag: 'w' })
}

function mergeInUniswap(compilerOutput: CompilerOutput) {
	;(compilerOutput.contracts as any)['UniswapV2Factory.sol'] = uniswapCompilerOutput.contracts['UniswapV2Factory.sol']
	;(compilerOutput.contracts as any)['UniswapV2Pair.sol'] = uniswapCompilerOutput.contracts['UniswapV2Pair.sol']
}

async function main() {
	const [compilerInput, compilerOutput] = await compileContracts()
	mergeInUniswap(compilerOutput)
	await writeCompilerInput(compilerInput)
	await writeCompilerOutput(compilerOutput)
	await writeGeneratedInterface(compilerOutput, outputFileNamePrefix)
}

main().then(() => {
	process.exit(0)
}).catch(error => {
	console.error(error)
	process.exit(1)
})
