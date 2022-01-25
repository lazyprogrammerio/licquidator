## The Lickuidator
Black magic for Polygon liquidations on QiDao


### How to get all the QiDao liquidable vaults


```bash
cd client

npm install

# higher cost than 0 MAI (all)
npm run find_liquidations

# higher cost than 1 MAI
MIN_MAI_COST=1 npm run find_liquidations 1
```
