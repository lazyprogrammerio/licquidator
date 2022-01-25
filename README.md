## The Lickuidator

Black magic for Polygon liquidations on QiDao.

## LEGAL NOTE

```bash
THE PURPOSE OF THIS REPOSITORY IS FOR EDUCATIONAL PURPOSES ONLY.

BECAUSE THE PROGRAM IS LICENSED FREE OF CHARGE, THERE IS NO WARRANTY
FOR THE PROGRAM.
THE ENTIRE RISK AS TO THE OUTCOMES, QUALITY AND PERFORMANCE OF THE
PROGRAM IS WITH YOU.
SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY
SERVICING, REPAIR, CORRECTION OR LOSS.
```

### How to get all the QiDao liquidable vaults


```bash
cd client

npm install

# higher cost than 0 MAI (all)
npm run find_liquidations

# higher cost than 1 MAI
MIN_MAI_COST=1 npm run find_liquidations 1
```
