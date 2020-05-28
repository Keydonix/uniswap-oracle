# uniswap-oracle
A general purpose price feed oracle built on Uniswap v2 that supports arbitrary time windows and donations for funding.

## Usage
TODO

## Developing
### Building
#### Contracts
```
cd contracts
```
#### SDK
```
cd sdk
npm install # one time

npm run build
```
#### Demo
```
cd demo
npm install # one time

npm run build-contracts # compiles contracts
```

### Running
```
cd demo
docker-compose up --force-recreate --always-recreate-deps --abort-on-container-exit --remove-orphans --renew-anon-volumes
npm run demo
```
