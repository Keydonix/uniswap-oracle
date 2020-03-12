# uniswap-oracle
A general purpose price feed oracle built on Uniswap v2 that supports arbitrary time windows and donations for funding.

## Usage
TODO

## Developing
### Building
#### Library
```
cd library
npm install # one time

npm run build # compiles contracts and then compiles typescript
# or
npm run compile-contracts
npm run watch
```
#### node-peer
```
cd node-peer
npm install # one time

npm run build
# or
npm run watch
```

### Test
```
cd tests
npm install # one time
npm test # make sure you are watching the other projects so tests see changes!
```
