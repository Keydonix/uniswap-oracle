declare module 'ethereum' {
	export type Primitive = 'uint8' | 'uint32' | 'uint64' | 'uint112' | 'uint256' | 'bool' | 'string' | 'address' | 'bytes20' | 'bytes32' | 'bytes' | 'int256' | 'tuple' | 'address[]' | 'uint256[]' | 'bytes32[]' | 'tuple[]'

	export interface AbiParameter {
		readonly name: string
		readonly type: Primitive
		readonly components?: ReadonlyArray<AbiParameter>
		readonly internalType?: Primitive
	}

	export interface AbiEventParameter extends AbiParameter {
		readonly indexed: boolean
	}

	export interface AbiFunction {
		readonly name: string
		readonly type: 'function' | 'fallback'
		readonly stateMutability: 'pure' | 'view' | 'payable' | 'nonpayable'
		readonly constant: boolean
		readonly payable: boolean
		readonly inputs: ReadonlyArray<AbiParameter>
		readonly outputs: ReadonlyArray<AbiParameter>
	}

	export interface AbiConstructor {
		readonly type: 'constructor'
		readonly payable: boolean
		readonly stateMutability: 'pure' | 'view' | 'payable' | 'nonpayable'
		readonly inputs: ReadonlyArray<AbiParameter>
	}

	export interface AbiEvent {
		readonly name: string
		readonly type: 'event'
		readonly inputs: ReadonlyArray<AbiEventParameter>
		readonly anonymous: boolean
	}

	export type Abi = ReadonlyArray<AbiFunction | AbiEvent | AbiConstructor>
}
