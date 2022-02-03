async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const Token = await ethers.getContractFactory("BlackMagic");
  const token = await Token.deploy("0xd05e3E715d945B59290df0ae8eF85c1BdB684744");
  await token.deployed();
  console.log("Contract address: ", token.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

