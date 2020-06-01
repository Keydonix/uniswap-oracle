export function isUint8Array(maybe: unknown): maybe is Uint8Array { return maybe instanceof Uint8Array }
export function uint8ArrayToUnsignedInteger(value: Uint8Array) { return value.reduce((aggregate, current) => (aggregate << 8n) + BigInt(current), 0n) }
export function unsignedIntegerToUint8Array(value: bigint | number, widthInBytes: 8|20|32|256 = 32) {
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value)) throw new Error(`${value} is not able to safely be cast into a bigint.`)
		value = BigInt(value)
	}
	if (value >= 2n ** (BigInt(widthInBytes) * 8n) || value < 0n) throw new Error(`Cannot fit ${value} into a ${widthInBytes * 8}-bit unsigned integer.`)
	const result = new Uint8Array(widthInBytes)
	if (result.length !== widthInBytes) throw new Error(`Cannot a ${widthInBytes} value into a ${result.length} byte array.`)
	for (let i = 0; i < result.length; ++i) {
		result[i] = Number((value >> BigInt((widthInBytes - i) * 8 - 8)) & 0xffn)
	}
	return result
}
