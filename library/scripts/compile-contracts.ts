import { promises as filesystem } from 'fs'
import * as path from 'path'
import { CompilerOutput, CompilerInput, compile } from 'solc'
import { generateContractInterfaces } from '@zoltu/solidity-typescript-generator'

const outputFileNamePrefix = 'uniswap-oracle'
const filenamesOrSources = [
	'UniswapOracle.sol',
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
	return path.join(__dirname, '..', 'contracts', fileName);
}

async function compileContracts(): Promise<[CompilerInput, CompilerOutput]> {
	let sources: Record<string, { content: string }> = {}
	for (const filenameOrSource of filenamesOrSources) {
		const absolutePath = await resolveRelativeContractPath(filenameOrSource)
		const content = await filesystem.readFile(absolutePath, 'utf8')
		sources[filenameOrSource] = { content }
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

async function writeGeneratedInterface(compilerOutput: CompilerOutput) {
	const filePath = path.join(destinationRootPath, `${outputFileNamePrefix}.ts`)
	await ensureDirectoryExists(path.dirname(filePath))
	const fileContents = await generateContractInterfaces(compilerOutput)
	await filesystem.writeFile(filePath, fileContents, { encoding: 'utf8', flag: 'w' })
}

async function main() {
	const [compilerInput, compilerOutput] = await compileContracts()
	await writeCompilerInput(compilerInput)
	await writeCompilerOutput(compilerOutput)
	await writeGeneratedInterface(compilerOutput)
}

main().then(() => {
	process.exit(0)
}).catch(error => {
	console.error(error)
	process.exit(1)
})
