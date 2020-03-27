pragma solidity 0.6.4;

import "./SafeMath.sol";
import "./IUniswapV2Pair.sol";
import "./IUniswapV2Factory.sol";

contract UniswapOracle {
    using SafeMath for uint256;

    IUniswapV2Factory public uniswapFactory;
    mapping (IUniswapV2 => mapping (uint256 => FeedDetails)) feed;

    struct FeedDetails {
        uint256 accumulator0;
        uint256 accumulator1;
        uint256 price;
        uint256 feedStarted;
        uint256 feedUpdated;
    }

    constructor(IUniswapV2Factory _uniswapFactory) public {
        uniswapFactory = _uniswapFactory;
    }

    function bump(IUniswapV2 _uniswap, uint256 _timeframe) external {
        uint256 _secondsSinceLastUpdate = now - feed[_uniswap][_timeframe].feedUpdated;
        if (_secondsSinceLastUpdate > _timeframe) {
            feed[_uniswap][_timeframe] = FeedDetails(
                _uniswap.price0CumulativeLast(),
                _uniswap.price1CumulativeLast(),
                0,
                now,
                now
            );
            return;
         }

        uint256 _newblockTimestampLast = _uniswap.blockTimestampLast();
        if (_newblockTimestampLast == now) {
            return;
        }
        uint256 _deltaTimestamp = now.sub(_newblockTimestampLast);

        uint256 _newAccumulator0 = _uniswap.price0CumulativeLast();
        uint256 _newAccumulator1 = _uniswap.price1CumulativeLast();

        // No SafeMath, we need to underflow here if necessary
        uint256 _deltaAccumulator0 = _newAccumulator0 - feed[_uniswap][_timeframe].accumulator0;
        uint256 _deltaAccumulator1 = _newAccumulator1 - feed[_uniswap][_timeframe].accumulator1;

        uint256 _deltaPriceInAtto = _deltaAccumulator0.mul(1e18).div(_deltaAccumulator1).div(_deltaTimestamp);
        // merge new price with old price, weighted by time delta
        // TODO: SafeMath
        feed[_uniswap][_timeframe].price =
                    (
                        (_deltaPriceInAtto * _deltaTimestamp)
                      + (feed[_uniswap][_timeframe].price * (_timeframe - _deltaTimestamp))
                    ) / _timeframe;

        feed[_uniswap][_timeframe].feedUpdated = _newblockTimestampLast;
        feed[_uniswap][_timeframe].accumulator0 = _newAccumulator0;
        feed[_uniswap][_timeframe].accumulator1 = _newAccumulator1;
    }

    function isFeedValid(IUniswapV2 _uniswap, uint256 _timeframe) public view returns (bool _isValid) {
        uint256 _timeRequirement = now.sub(_timeframe);
        _isValid = feed[_uniswap][_timeframe].feedStarted < _timeRequirement && feed[_uniswap][_timeframe].feedUpdated > _timeRequirement;
        return _isValid;
    }

    function getPrice0(IUniswapV2 _uniswap, uint256 _timeframe) public view returns (uint256 _price, bool isValid) {
        return (feed[_uniswap][_timeframe].price, isFeedValid(_uniswap, _timeframe));
    }

    function getPrice1(IUniswapV2 _uniswap, uint256 _timeframe) public view returns (uint256 _price, bool isValid) {
        // This translates a price into the other direction. If tokenA->tokenB = 1e19, tokenB->tokenA = 1e17
        return (1e36.div(feed[_uniswap][_timeframe].price), isFeedValid(_uniswap, _timeframe));
    }

    function getPriceOf(address _tokenA, address _tokenB, uint256 _timeframe) external view returns (uint256 _price, bool isValid) {
         (address _token0, address _token1, bool _flip) = _tokenA < _tokenB ? (_tokenA, _tokenB, false) : (_tokenB, _tokenA, true);
         IUniswapV2 _uniswapV2 = IUniswapV2(uniswapFactory.getPair(_token0, _token1));
         return _flip ? getPrice1(_uniswapV2, _timeframe) : getPrice0(_uniswapV2, _timeframe);
    }
}
