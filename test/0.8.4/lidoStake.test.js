const { assertBn, assertRevert, assertEvent } = require('@aragon/contract-helpers-test/src/asserts')

const LidoStake = artifacts.require('LidoStake.sol')
const Lido = artifacts.require('LidoMock.sol')
const ERC20 = artifacts.require('ERC20Mock.sol')
const NodeOperatorsRegistry = artifacts.require('NodeOperatorsRegistry')
const { newDao, newApp } = require('../0.4.24/helpers/dao')

const OracleMock = artifacts.require('OracleMock.sol')
const DepositContractMock = artifacts.require('DepositContractMock.sol')

contract('Lido Stake', ([appManager, _, user1, user2, user3, ___]) => {
  let app, appBase, oracle, depositContract, nodeOperatorsRegistryBase, operators, newLido
  const ETH = (value) => web3.utils.toWei(value + '', 'ether')

  before('deploy base app', async () => {
    // Deploy the app's base contract.
    newLido = await Lido.new()
    oracle = await OracleMock.new()
    depositContract = await DepositContractMock.new()
    nodeOperatorsRegistryBase = await NodeOperatorsRegistry.new()
    anyToken = await ERC20.new()

    // operate new proxy
    ;({ dao, _ } = await newDao(appManager))

    // Instantiate a proxy for the app, using the base contract as its logic implementation.
    let proxyAddress = await newApp(dao, 'lido', newLido.address, appManager)
    baseApp = await Lido.at(proxyAddress)

    appBase = await LidoStake.new(proxyAddress, proxyAddress, user3)
    app = await LidoStake.at(appBase.address)

    // NodeOperatorsRegistry
    proxyAddress = await newApp(dao, 'node-operators-registry', nodeOperatorsRegistryBase.address, appManager)
    operators = await NodeOperatorsRegistry.at(proxyAddress)
    await operators.initialize(baseApp.address)

    // Initialize the app's proxy.
    await baseApp.initialize(depositContract.address, oracle.address, operators.address)
  })

  describe('Add new staking to Lido vault', async () => {
    it('add stake', async () => {
      const result = await app.callStake({ from: user1, value: ETH(3) })
      assertBn(await baseApp.balanceOf(appBase.address), ETH(3))
      assertEvent(result, 'Staked', { expectedArgs: { user: user1, amount: ETH(3) } })
    })

    it('send stake', async () => {
      await web3.eth.sendTransaction({ to: app.address, from: user1, value: ETH(1) })
      assertBn(await baseApp.balanceOf(appBase.address), ETH(4))
      assertBn(await app.getAvailableAmount({ from: user1 }), ETH(4))
    })

    it('add stake with zero eth', async () => {
      await assertRevert(app.callStake({ from: user1, value: ETH(0) }), "You're meant to send more than 0 eth to stake")
    })
  })

  describe('Withdraw rewards from staking', async () => {
    it('withdraw more tokens than owned', async () => {
      await assertRevert(app.withdrawStake(ETH(50), { from: user1 }), 'Amount given is more than withdrawable amount from vault.')
    })

    it('withdraw tokens', async () => {
      const result = await app.withdrawStake(ETH(1), { from: user1 })
      assertBn(await baseApp.balanceOf(appBase.address), ETH(3))
      assertBn(await baseApp.balanceOf(user1), ETH(1))
      assertEvent(result, 'withdrawn', { expectedArgs: { user: user1, amount: ETH(1) } })
    })

    it('withdraw for a non-staker', async () => {
      await assertRevert(app.withdrawStake(ETH(30), { from: user2 }), 'No verifiable balance for this wallet yet.')
    })
  })
})
