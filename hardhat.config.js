/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
	solidity: {
		compilers: [
			{
				version: "0.8.11",
				settings: {
					optimizer: {
						enabled: true,
						runs: 200,
						// details: {
						// 	yul: true,
						// 	yulDetails: {
						// 		stackAllocation: true,
						// 		optimizerSteps: "dhfoDgvulfnTUtnIf"
						// 	}
						// }
					}
				},
			},
		]
	},
};
