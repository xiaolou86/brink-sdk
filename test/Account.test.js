require('@openzeppelin/test-helpers') // for bignumber.equal chai behavior

const { ethers } = require('hardhat')
const { utf8ToHex, randomHex } = require('web3-utils')
const { chainId } = require('@brinkninja/environment/config/network.config.local1.json')
const tokens = require('@brinkninja/environment/config/tokens.local1.json')

const Deployer = require('./helpers/Deployer')
const { Account, AccountSigner, PrivateKeySigner, MessageEncoder, BrinkSDK } = require('../src')
const computeAccountAddress = require('../src/computeAccountAddress')

const BN = ethers.BigNumber.from
const ownerAddress = '0x6ede982a4e7feb090c28a357401d8f3a6fcc0829'
const ownerPrivateKey = '0x4497d1a8deb6a0b13cc85805b6392331623dd2d429db1a1cad4af2b57fcdec25'

const { chaiSolidity } = require('@brinkninja/test-helpers')
const { expect } = chaiSolidity()


describe('Account with PrivateKeySigner', function () {
  beforeEach(async function () {
    const environmentConfiguration = {}
    const deployments = []

    // Singleton Factory
    const SingletonFactory = await ethers.getContractFactory('SingletonFactory')
    this.singletonFactory = await SingletonFactory.deploy()
    const singletonFactoryItem = {
      name: 'singletonFactory',
      contract: 'SingletonFactory',
      address: this.singletonFactory.address
    }

    // Create deployer
    this.deployer = new Deployer(this.singletonFactory)

    // Call executor 
    this.callExecutor = await this.deployer.deploy('CallExecutor', [], [])
    const callExecutorItem = {
      name: 'callExecutor',
      contract: 'CallExecutor',
      address: this.callExecutor.address
    }

    // Account contract
    this.accountContract = await this.deployer.deploy(
      'Account', ['address'], [this.callExecutor.address]
    )
    const accountContractItem = {
      name: 'account',
      contract: 'Account',
      address: this.accountContract.address
    }

    // Deploy and execute
    this.deployAndExecute = await this.deployer.deploy(
      'DeployAndExecute', 
      ['address', 'address'], 
      [this.singletonFactory.address, this.accountContract.address]
    )
    const deployAndExecuteItem = {
      name: 'deployAndExecute',
      contract: 'DeployAndExecute',
      address: this.deployAndExecute.address
    }

    // Transfer Verifier
    const TransferVerifier = await ethers.getContractFactory("TransferVerifier");
    this.transferVerifier = await TransferVerifier.deploy()
    const transferVerifierItem = {
      name: 'transferVerifier',
      contract: 'TransferVerifier',
      address: this.transferVerifier.address
    }

    // Proxy Admin Verifier
    const ProxyAdminVerifier = await ethers.getContractFactory("ProxyAdminVerifier");
    this.proxyAdminVerifier = await ProxyAdminVerifier.deploy()
    const proxyAdminVerifierItem = {
      name: 'proxyAdminVerifier',
      contract: 'ProxyAdminVerifier',
      address: this.proxyAdminVerifier.address
    }

    // Limit Swap Verifier
    const LimitSwapVerifier = await ethers.getContractFactory("LimitSwapVerifierMock");
    this.limitSwapVerifier = await LimitSwapVerifier.deploy()
    const limitSwapVerifierItem = {
      name: 'limitSwapVerifier',
      contract: 'LimitSwapVerifier',
      address: this.limitSwapVerifier.address
    }


    deployments.push(
      singletonFactoryItem, 
      callExecutorItem, 
      accountContractItem, 
      deployAndExecuteItem,
      transferVerifierItem,
      proxyAdminVerifierItem,
      limitSwapVerifierItem
    )

    environmentConfiguration.chainId = chainId
    environmentConfiguration.deployments = deployments
    environmentConfiguration.accountDeploymentSalt = randomHex(32)
    environmentConfiguration.accountVersion = '1'
    this.accountSalt = environmentConfiguration.accountDeploymentSalt

    const brinkSDK = new BrinkSDK(environmentConfiguration)

    const signers = await ethers.getSigners()
    this.ethersSigner = signers[0]
    
    const privateKeySigner = new PrivateKeySigner(ownerPrivateKey)

    await this.ethersSigner.sendTransaction({
      to: ownerAddress,
      value: ethers.utils.parseEther("500.0")
    });
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0x6ede982a4e7feb090c28a357401d8f3a6fcc0829"]}
    )
    this.ownerSigner = await ethers.getSigner("0x6ede982a4e7feb090c28a357401d8f3a6fcc0829")

    const { account, accountSigner } = brinkSDK.newAccount(this.ownerSigner, privateKeySigner, ethers)
    this.account = account
    this.accountSigner = accountSigner
    this.messageEncoder = new MessageEncoder()

    this.token = await this.deployer.deploy(
      'TestERC20',
      ['string', 'string', 'uint8'],
      [tokens[0].name, tokens[0].symbol, tokens[0].decimals]
    )
    await this.token.mint(this.account.address, BN(10).pow(9).mul(BN(10).pow(tokens[0].decimals)))
    
  })

  describe('when contract code is deployed', function () {
    it('should return true from isDeployed()', async function () {
      let resp = await this.account.deploy()
      expect(await this.account.isDeployed()).to.be.true
    })
  })

  describe('deploy', function () {
    describe('when given valid params', function () {
      beforeEach(async function () {
        await this.account.deploy()
      })

      it('should deploy the account', async function () {
        expect(await this.account.isDeployed()).to.be.true
      })

      it('should set the account address', function () {
        const expectedAccountAddress = computeAccountAddress(
          this.singletonFactory.address,
          this.accountContract.address,
          ownerAddress,
          chainId,
          this.accountSalt
        )
        expect(this.account.address).to.equal(expectedAccountAddress)
      })
    })
  })

  describe('delegateCall', function () {
    beforeEach(async function () {
      await this.account.deploy()
    })

    it('Should complete an ETH transfer with delegateCall', async function () {
      const recipientAddress = '0x17be668e8fc88ef382f0615f385b50690313a121'
      await this.ethersSigner.sendTransaction({
        to: this.account.address,
        value: ethers.utils.parseEther("1.0")
      });
      const transferAmount = await ethers.utils.parseEther('0.01')
      const transferEthData = await this.messageEncoder.encodeTransferEth(ethers.BigNumber.from(0).toString(), ethers.BigNumber.from(1).toString(), recipientAddress, transferAmount.toString())
      const tx = await this.account.delegateCall(this.transferVerifier.address, transferEthData)
      expect(tx).to.not.be.undefined
      expect(await ethers.provider.getBalance(recipientAddress)).to.equal(ethers.utils.parseEther('0.01'))
    })
  })

  describe('externalCall', function () {
    beforeEach(async function () {
      await this.account.deploy()
    })

    it('Should complete an ETH transfer with externalCall', async function () {
      const recipientAddress = '0x17be668e8fc88ef382f0615f385b50690313a122'
      await this.ethersSigner.sendTransaction({
        to: this.account.address,
        value: ethers.utils.parseEther("1.0")
      });
      const transferAmount = await ethers.utils.parseEther('0.01')
      const tx = await this.account.externalCall(transferAmount.toString(), recipientAddress, '0x')
      expect(tx).to.not.be.undefined
      expect(await ethers.provider.getBalance(recipientAddress)).to.equal(ethers.utils.parseEther('0.01'))
    })
  })

  describe('metaDelegateCall', function () {
    beforeEach(async function () {
      const CallExecutor = await ethers.getContractFactory("CallExecutor");
      this.callExecutor = await CallExecutor.deploy()
      this.upgradedAccountContract = await this.deployer.deploy(
        'Account', ['address'], [this.callExecutor.address]
      )
    })

    it('Should return completed tx for metaDelegateCall with account deployment', async function () {
      const signedUpgradeFnCall = await this.accountSigner.signUpgrade(this.upgradedAccountContract.address)
      const to = signedUpgradeFnCall.signedParams[0].value
      const data = signedUpgradeFnCall.signedParams[1].value
      const signature = signedUpgradeFnCall.signature
      
      const tx = await this.account.metaDelegateCall(to, data, signature)
      expect(tx).to.not.be.undefined
    })

    it('Should return completed tx for metaDelegateCall without account deployment', async function () {
      await this.account.deploy()
      const signedUpgradeFnCall = await this.accountSigner.signUpgrade(this.upgradedAccountContract.address)
      const to = signedUpgradeFnCall.signedParams[0].value
      const data = signedUpgradeFnCall.signedParams[1].value
      const signature = signedUpgradeFnCall.signature
      
      const tx = await this.account.metaDelegateCall(to, data, signature)
      expect(tx).to.not.be.undefined
    })
  })

  describe('transactionInfo', function () {
    beforeEach(async function () {
      const CallExecutor = await ethers.getContractFactory("CallExecutor");
      this.callExecutor = await CallExecutor.deploy()
      this.upgradedAccountContract = await this.deployer.deploy(
        'Account', ['address'], [this.callExecutor.address]
      )
      this.messageEncoder = new MessageEncoder()
    })

    it('Should return tx info for metaDelegateCall with account deployment', async function () {
      const signedUpgradeFnCall = await this.accountSigner.signUpgrade(this.upgradedAccountContract.address)
      const to = signedUpgradeFnCall.signedParams[0].value
      const data = signedUpgradeFnCall.signedParams[1].value
      const signature = signedUpgradeFnCall.signature
      const { gasEstimate, contractName, functionName, paramTypes, params } = await this.account.transactionInfo('metaDelegateCall', [to, data, signature])
      expect(contractName).to.be.equal('DeployAndExecute')
      expect(functionName).to.be.equal('deployAndExecute')
      expect(parseInt(gasEstimate.toString())).to.be.closeTo(179000, 1000)
    })

    it('Should return tx info for metaDelegateCall without account deployment', async function () {
      await this.account.deploy()
      const signedUpgradeFnCall = await this.accountSigner.signUpgrade(this.upgradedAccountContract.address)
      const to = signedUpgradeFnCall.signedParams[0].value
      const data = signedUpgradeFnCall.signedParams[1].value
      const signature = signedUpgradeFnCall.signature
      const { gasEstimate, contractName, functionName, paramTypes, params } = await this.account.transactionInfo('metaDelegateCall', [to, data, signature])
      expect(contractName).to.be.equal('Account')
      expect(functionName).to.be.equal('metaDelegateCall')
      expect(parseInt(gasEstimate.toString())).to.be.closeTo(45241, 1000)
    })

    it('Should return tx info for delegateCall eth transfer', async function () {
      await this.account.deploy()
      const recipientAddress = '0x17be668e8fc88ef382f0615f385b50690313a123'
      const transferAmount = await ethers.utils.parseEther('0.01')
      const transferEthData = await this.messageEncoder.encodeTransferEth(ethers.BigNumber.from(0).toString(), ethers.BigNumber.from(1).toString(), recipientAddress, transferAmount.toString())

      const { gasEstimate, contractName, functionName, paramTypes, params } = await this.account.transactionInfo('delegateCall', [recipientAddress, transferEthData])
      expect(contractName).to.be.equal('Account')
      expect(functionName).to.be.equal('delegateCall')
      expect(parseInt(gasEstimate.toString())).to.be.closeTo(33750, 1000)
    })

    it('Should return tx info for externalCall eth transfer', async function () {
      await this.ethersSigner.sendTransaction({
        to: this.account.address,
        value: ethers.utils.parseEther("0.01")
      });
      await this.account.deploy()
      const recipientAddress = '0x17be668e8fc88ef382f0615f385b50690313a124'
      const transferAmount = await ethers.utils.parseEther('0.01')
      const transferEthData = await this.messageEncoder.encodeTransferEth(ethers.BigNumber.from(0).toString(), ethers.BigNumber.from(1).toString(), recipientAddress, transferAmount.toString())

      const { gasEstimate, contractName, functionName, paramTypes, params } = await this.account.transactionInfo('externalCall', [transferAmount.toString(), recipientAddress, '0x'])
      expect(contractName).to.be.equal('Account')
      expect(functionName).to.be.equal('externalCall')
      expect(parseInt(gasEstimate.toString())).to.be.closeTo(66839, 1000)
    })

    it('Should return tx info for metaPartialSignedDelegateCall without account deployment', async function () {
      await this.account.deploy()
      const randomAddress = '0x13be228b8fc66ef382f0615f385b50710313a188'
      const signedEthToTokenSwap = await this.accountSigner.signEthToTokenSwap(
        '0', '1', this.token.address, '10', '10', randomAddress, '0x123'
      )
      const to = signedEthToTokenSwap.signedParams[0].value
      const data = signedEthToTokenSwap.signedParams[1].value
      const signature = signedEthToTokenSwap.signature
      const unsignedData = {
        paramTypes: [
          { name: 'to', type: 'address' },
          { name: 'data', type: 'bytes'},
        ],
        params: [randomAddress, '0x123']
      }
      const unsignedDataEncoded = await this.messageEncoder.encodeParams(unsignedData)
      const { gasEstimate, contractName, functionName, paramTypes, params } = await this.account.transactionInfo('metaPartialSignedDelegateCall', [to, data, signature, unsignedDataEncoded])
      expect(contractName).to.be.equal('Account')
      expect(functionName).to.be.equal('metaPartialSignedDelegateCall')
      expect(parseInt(gasEstimate.toString())).to.be.closeTo(50000, 1000)
    })

    it('Should return tx info for metaPartialSignedDelegateCall with account deployment', async function () {
      const randomAddress = '0x13be228b8fc66ef382f0615f385b50710313a188'
      const signedEthToTokenSwap = await this.accountSigner.signEthToTokenSwap(
        '0', '1', this.token.address, '10', '10', randomAddress, '0x123'
      )
      const to = signedEthToTokenSwap.signedParams[0].value
      const data = signedEthToTokenSwap.signedParams[1].value
      const signature = signedEthToTokenSwap.signature
      const unsignedData = {
        paramTypes: [
          { name: 'to', type: 'address' },
          { name: 'data', type: 'bytes'},
        ],
        params: [randomAddress, '0x123']
      }
      const unsignedDataEncoded = await this.messageEncoder.encodeParams(unsignedData)
      const { gasEstimate, contractName, functionName, paramTypes, params } = await this.account.transactionInfo('metaPartialSignedDelegateCall', [to, data, signature, unsignedDataEncoded])
      expect(contractName).to.be.equal('DeployAndExecute')
      expect(functionName).to.be.equal('deployAndExecute')
      expect(parseInt(gasEstimate.toString())).to.be.closeTo(187000, 1000)
    })
  })
})