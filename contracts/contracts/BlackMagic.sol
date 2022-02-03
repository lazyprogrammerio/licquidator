// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;


import { FlashLoanReceiverBase } from "./FlashLoanReceiverBase.sol";
import { ILendingPool, ILendingPoolAddressesProvider, IERC20 } from "./Interfaces.sol";
import { SafeMath } from "./Libraries.sol";

interface QidaoVault {
     function liquidateVault(uint256 vaultID) external;
     function checkLiquidation(uint256 vaultID) external view returns (bool);
     function getPaid() external;
     function checkCost(uint256 vaultID) external view returns (uint256);
     function collateral() external view returns (address);
}

interface IAsset {
    // solhint-disable-previous-line no-empty-blocks
}

enum SwapKind { GIVEN_IN, GIVEN_OUT }

struct SingleSwap {
    bytes32 poolId;
    SwapKind kind;
    IAsset assetIn;
    IAsset assetOut;
    uint256 amount;
    bytes userData;
}

struct FundManagement {
    address sender;
    bool fromInternalBalance;
    address recipient;
    bool toInternalBalance;
}

interface BalancerV2Swap {
    function swap(
        SingleSwap memory singleSwap,
        FundManagement memory funds,
        uint256 limit,
        uint256 deadline
    ) external returns (uint256);
}

interface BalancerV2Pool {
    function getPoolId() external view returns (bytes32);
}

interface UniswapV2Router02 {

    function swapExactTokensForTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)
        external
        payable
        returns (uint[] memory amounts);

}


contract BlackMagic is FlashLoanReceiverBase {

    using SafeMath for uint256;
    uint256 constant public MAX_SPEND_INT_NUMBER = 1329227995784915872903807060280344575;
    uint256 constant public MAX_INT_NUMBER = 115792089237316195423570985008687907853269984665640564039457584007913129639935;

    address public owner;

    ILendingPoolAddressesProvider provider;
    address lendingPoolAddr;

    address usdcErc20Matic = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address maiErc20Matic = 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1;

    address balancerV2Approval = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address usdcMaiBalancerPool = 0x06Df3b2bbB68adc8B0e302443692037ED9f91b42;

    uint256 internal liquidatingVaultId = 0;
    address internal liquidatingVaultContract = maticVaultContract;
    address maticVaultContract = 0x595B3E98641C4d66900a24aa6Ada590b41eF85AA;

    address quickSwapRouter = 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff;

    constructor(ILendingPoolAddressesProvider _addressProvider) FlashLoanReceiverBase(_addressProvider) {

        owner = msg.sender;
        provider = _addressProvider;
        lendingPoolAddr = provider.getLendingPool();

        // Approve Balancer for swapping
        IERC20(usdcErc20Matic).approve(address(balancerV2Approval), MAX_SPEND_INT_NUMBER);
        IERC20(maiErc20Matic).approve(address(balancerV2Approval), MAX_SPEND_INT_NUMBER);

    }

    function getOwnerTokens() private {
        require(IERC20(usdcErc20Matic).transferFrom(owner, address(this), IERC20(usdcErc20Matic).balanceOf(owner)), "Usdc transfer failed");
        require(IERC20(maiErc20Matic).transferFrom(owner, address(this), IERC20(maiErc20Matic).balanceOf(owner)), "Mimatic transfer failed");
    }

    function startLoan(uint256 vaultId, address vaultContract, bytes calldata _params) public onlyOwner {
        // get all the owner usdc / mimatic so that it is used to cover the delta
        getOwnerTokens();

        // set params to be used later on
        liquidatingVaultId = vaultId;
        liquidatingVaultContract = vaultContract;

        // check mimatic cost
        uint256 costMai = QidaoVault(liquidatingVaultContract).checkCost(vaultId);
        // borrow more than needed to cover the fees
        uint256 costUsdc = (costMai / 1000000000000) * 110 / 100;

        address receiverAddress = address(this);

        address[] memory assets = new address[](1);
        assets[0] = usdcErc20Matic;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = costUsdc;
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        LENDING_POOL.flashLoan(
            receiverAddress,
            assets,
            amounts,
            modes,
            receiverAddress,
            new bytes(0),
            0
        );
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    )
        external
        override
        returns (bool)
    {
        FundManagement memory fundManagement;
        fundManagement.sender = address(this);
        fundManagement.recipient = address(this);

        // swap all USDC to MAI
        SingleSwap memory singleSwap;
        singleSwap.assetIn = IAsset(usdcErc20Matic);
        singleSwap.assetOut = IAsset(maiErc20Matic);
        singleSwap.poolId = BalancerV2Pool(usdcMaiBalancerPool).getPoolId();
        singleSwap.amount = IERC20(usdcErc20Matic).balanceOf(address(this));
        BalancerV2Swap(balancerV2Approval).swap(singleSwap, fundManagement, 0, MAX_INT_NUMBER);

        // liquidate
        uint256 costMatic = QidaoVault(liquidatingVaultContract).checkCost(liquidatingVaultId);
        require(costMatic <= IERC20(maiErc20Matic).balanceOf(address(this)), "Not enough mimatic");

        // Approve vaults
        IERC20(maiErc20Matic).approve(liquidatingVaultContract, MAX_SPEND_INT_NUMBER);

        QidaoVault(liquidatingVaultContract).liquidateVault(liquidatingVaultId);
        QidaoVault(liquidatingVaultContract).getPaid();

        // swap all MAI BACK to USDC
        SingleSwap memory singleSwapMaiToUsdc;
        singleSwapMaiToUsdc.assetOut = IAsset(usdcErc20Matic);
        singleSwapMaiToUsdc.assetIn = IAsset(maiErc20Matic);
        singleSwapMaiToUsdc.poolId = BalancerV2Pool(usdcMaiBalancerPool).getPoolId();
        singleSwapMaiToUsdc.amount = IERC20(maiErc20Matic).balanceOf(address(this));
        BalancerV2Swap(balancerV2Approval).swap(singleSwapMaiToUsdc, fundManagement, 0, MAX_INT_NUMBER);

        // Approve the LendingPool contract allowance to *pull* the owed amount
        // i.e. AAVE V2's way of repaying the flash loan
        uint256 amountOwing = amounts[0].add(premiums[0]);
        IERC20(assets[0]).approve(address(LENDING_POOL), amountOwing);

        if (liquidatingVaultContract == maticVaultContract) {
          // send matic or the other token
          (bool sent,) = owner.call{value: address(this).balance}("");
          require(sent, "2");
        } else {
          // approve quickswap to take all the convertFromTokens
          IERC20(QidaoVault(liquidatingVaultContract).collateral()).approve(quickSwapRouter, MAX_SPEND_INT_NUMBER);

          // swap collateral for USDC on Quickswap
          address[] memory path = new address[](2);
          path[0] = QidaoVault(liquidatingVaultContract).collateral();
          path[1] = usdcErc20Matic;
          UniswapV2Router02(quickSwapRouter).swapExactTokensForTokens(IERC20(QidaoVault(liquidatingVaultContract).collateral()).balanceOf(address(this)), 0, path, address(this), block.timestamp);

          // send the collateral tokens left back, if any
          require(IERC20(QidaoVault(liquidatingVaultContract).collateral()).transfer(owner, IERC20(QidaoVault(liquidatingVaultContract).collateral()).balanceOf(address(this))), "Collateral transfer failed");
        }

        //send everything back home
        require(IERC20(usdcErc20Matic).transfer(owner, IERC20(usdcErc20Matic).balanceOf(address(this)) - amountOwing), "Usdc transfer failed");
        require(IERC20(maiErc20Matic).transfer(owner, IERC20(maiErc20Matic).balanceOf(address(this))), "Mimatic transfer failed");

        return true;
    }


    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not owner");
        _;
    }

}

