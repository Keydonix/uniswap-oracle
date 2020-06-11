import { UniswapV2Pair, TestErc20 } from './generated/price-emitter'
import { SignerFetchRpc } from './rpc-factories'

export async function resetUniswapAndAccount(uniswapExchange: UniswapV2Pair, token0: TestErc20, token1: TestErc20, rpcAddress: bigint, token0Ratio: bigint, token1Ratio: bigint) {
	await drainUniswap(uniswapExchange, rpcAddress)
	await topupAccount(token0, token1, rpcAddress)
	await seedUniswap(uniswapExchange, token0, token1, rpcAddress, token0Ratio, token1Ratio)
}

export async function drainUniswap(uniswapExchange: UniswapV2Pair, rpcAddress: bigint) {
	const uniswapPoolBalance = await uniswapExchange.balanceOf_(rpcAddress)
	if (uniswapPoolBalance === 0n) return
	await uniswapExchange.transfer(uniswapExchange.address, uniswapPoolBalance)
	await uniswapExchange.burn(rpcAddress)
	await uniswapExchange.skim(rpcAddress)
}

export async function topupAccount(token0: TestErc20, token1: TestErc20, rpcAddress: bigint) {
	const targetBalance = 10_000n * 10n**18n
	const balance0 = await token0.balanceOf_(rpcAddress)
	const balance1 = await token1.balanceOf_(rpcAddress)
	if (balance0 < targetBalance) await token0.mint(targetBalance - balance0)
	if (balance1 < targetBalance) await token1.mint(targetBalance - balance1)
}

export async function seedUniswap(uniswapExchange: UniswapV2Pair, token0: TestErc20, token1: TestErc20, rpcAddress: bigint, token0Multiplier: bigint, token1Multiplier: bigint) {
	const seedSize = 100n * 10n ** 18n
	await setPrice(uniswapExchange, token0, token1, token0Multiplier, token1Multiplier)
	await token0.transfer(uniswapExchange.address, seedSize * token0Multiplier)
	await token1.transfer(uniswapExchange.address, seedSize * token1Multiplier)
	await uniswapExchange.mint(rpcAddress)
}

export async function setPrice(uniswapExchange: UniswapV2Pair, token0: TestErc20, token1: TestErc20, token0Multiplier: bigint, token1Multiplier: bigint) {
	const { _reserve0, _reserve1 } =  await uniswapExchange.getReserves_()
	if (_reserve0 * token1Multiplier === _reserve1 * token0Multiplier) return
	if (_reserve0 * token1Multiplier > _reserve1 * token0Multiplier) {
		const targetAmount1 = _reserve0 * token1Multiplier / token0Multiplier
		await token1.transfer(uniswapExchange.address, targetAmount1 - _reserve1)
	} else {
		const targetAmount0 = _reserve1 * token0Multiplier / token1Multiplier
		await token0.transfer(uniswapExchange.address, targetAmount0 - _reserve0)
	}
	await uniswapExchange.sync()
}

export async function mineBlocks(rpc: SignerFetchRpc, count: number) {
	const rpcAddress = await rpc.addressProvider()
	for (let i = 0; i < count; ++i) {
		await rpc.sendEth(rpcAddress, 0n)
	}
}

export async function swap0For1(uniswapExchange: UniswapV2Pair, token0: TestErc20, recipient: bigint, token0Amount: bigint) {
	const token1Out = await getToken1Out(uniswapExchange, token0Amount)
	await token0.transfer(uniswapExchange.address, token0Amount)
	await uniswapExchange.swap(0n, token1Out, recipient, new Uint8Array())
}

export async function swap1For0(uniswapExchange: UniswapV2Pair, token1: TestErc20, recipient: bigint, token1Amount: bigint) {
	const token0Out = await getToken1Out(uniswapExchange, token1Amount)
	await token1.transfer(uniswapExchange.address, token1Amount)
	await uniswapExchange.swap(0n, token0Out, recipient, new Uint8Array())
}

// cribbed from https://github.com/Uniswap/uniswap-v2-periphery/blob/57c3e93e2b979db7590e4b8bb28e7acfa049c192/contracts/libraries/UniswapV2Library.sol#L43-L50
export async function getToken1Out(uniswapExchange: UniswapV2Pair, token0In: bigint) {
	const { _reserve0: token0Reserve, _reserve1: token1Reserve } = await uniswapExchange.getReserves_()
	const amountInWithFee = token0In * 997n
	const numerator = amountInWithFee * token1Reserve
	const denominator = token0Reserve * 1000n + amountInWithFee
	const amountOut = numerator / denominator
	return amountOut
}
