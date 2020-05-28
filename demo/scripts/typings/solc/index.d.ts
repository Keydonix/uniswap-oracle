declare module 'solc' {
	import { Abi } from 'ethereum';

	interface CompilerInputSourceFile {
		readonly keccak256?: string;
		readonly urls: string[];
	}
	interface CompilerInputSourceCode {
		readonly keccak256?: string;
		readonly content: string;
	}
	interface CompilerInput {
		readonly language: "Solidity" | "serpent" | "lll" | "assembly";
		readonly settings?: any,
		readonly sources: {
			readonly [globalName: string]: CompilerInputSourceFile|CompilerInputSourceCode,
		};
	}
	interface CompilerOutputError {
		readonly sourceLocation?: {
			readonly file: string;
			readonly start: number;
			readonly end: number;
		};
		readonly type: "TypeError" | "InternalCompilerError" | "Exception";
		readonly component: "general" | "ewasm";
		readonly severity: "error" | "warning";
		readonly message: string;
		readonly formattedMessage?: string;
	}
	interface CompilerOutputEvmBytecode {
		readonly object: string;
		readonly opcodes?: string;
		readonly sourceMap?: string;
		readonly linkReferences?: {} | {
			readonly [globalName: string]: {
				readonly [name: string]: {start: number, length: number}[];
			};
		};
	}
	interface CompilerOutputSources {
		readonly [globalName: string]: {
			readonly id: number;
			readonly ast: any;
			readonly legacyAST: any;
		},
	}
	interface CompilerOutputContract {
		readonly abi: Abi;
		readonly metadata?: string;
		readonly userdoc?: any;
		readonly devdoc?: any;
		readonly ir?: string;
		readonly evm: {
			readonly assembly?: string;
			readonly legacyAssembly?: any;
			readonly bytecode: CompilerOutputEvmBytecode;
			readonly deployedBytecode?: CompilerOutputEvmBytecode;
			readonly methodIdentifiers?: {
				readonly [methodName: string]: string;
			};
			readonly gasEstimates?: {
				readonly creation: {
					readonly codeDepositCost: string;
					readonly executionCost: string;
					readonly totalCost: string;
				};
				readonly external: {
					readonly [functionSignature: string]: string;
				};
				readonly internal: {
					readonly [functionSignature: string]: string;
				};
			};
		};
		readonly ewasm?: {
			readonly wast: string;
			readonly wasm: string;
		}
	}
	interface CompilerOutputContractFile {
		readonly [contractName: string]: CompilerOutputContract
	}
	interface CompilerOutputContracts {
		readonly [globalName: string]: CompilerOutputContractFile
	}
	interface CompilerOutput {
		readonly errors?: CompilerOutputError[];
		readonly sources?: CompilerOutputSources;
		readonly contracts: CompilerOutputContracts;
	}
	type ReadCallback = (path: string) => { contents?: string, error?: string};
	function compile(input: string, readCallback?: ReadCallback): string;
}
