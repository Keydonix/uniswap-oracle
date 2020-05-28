import { ethereum, secp256k1, mnemonic, hdWallet } from '@zoltu/ethereum-crypto'
import { Bytes } from '@zoltu/ethereum-types';

export class MnemonicSigner {
	private constructor(
		private readonly privateKey: bigint,
		public readonly publicKey: secp256k1.AffinePoint & secp256k1.JacobianPoint,
		public readonly address: bigint,
	) { }

	public static readonly create = async (words: string[]) => {
		const seed = await mnemonic.toSeed(words)
		const privateKey = await hdWallet.privateKeyFromSeed(seed)
		const publicKey = await secp256k1.privateKeyToPublicKey(privateKey)
		const address = await ethereum.publicKeyToAddress(publicKey)
		return new MnemonicSigner(privateKey, publicKey, address)
	}

	sign = async (message: Bytes): Promise<{ r: bigint, s: bigint, yParity: 'even'|'odd' }> => {
		const signature = await ethereum.signRaw(this.privateKey, message)
		return {
			r: signature.r,
			s: signature.s,
			yParity: signature.recoveryParameter === 0 ? 'even' : 'odd',
		}
	}
}

export class PrivateKeySigner {
	private constructor(
		private readonly privateKey: bigint,
		public readonly publicKey: secp256k1.AffinePoint & secp256k1.JacobianPoint,
		public readonly address: bigint,
	) { }

	public static readonly create = async (privateKey: bigint) => {
		const publicKey = await secp256k1.privateKeyToPublicKey(privateKey)
		const address = await ethereum.publicKeyToAddress(publicKey)
		return new PrivateKeySigner(privateKey, publicKey, address)
	}

	sign = async (message: Bytes): Promise<{ r: bigint, s: bigint, yParity: 'even'|'odd' }> => {
		const signature = await ethereum.signRaw(this.privateKey, message)
		return {
			r: signature.r,
			s: signature.s,
			yParity: signature.recoveryParameter === 0 ? 'even' : 'odd',
		}
	}
}
