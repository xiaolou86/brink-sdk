const _ = require('lodash')
const { loadEnvironment } = require('@brinkninja/environment')
const Account = require('./src/Account')
const AccountSigner = require('./src/AccountSigner')
const computeAccountAddress = require('./src/computeAccountAddress')

class BrinkSDK {

  // environment: @brinkninja/environment network string or configuration object
  // ethers: ethers.js instance
  // signer: ethers.js signer (options, uses provider.signer by default)
  constructor (environment) {
    if (!environment) throw new Error(`no environment specified`)
    if (typeof environment == 'string') {
      this.environment = loadEnvironment(environment)
    } else {
      this.environment = environment
    }
  }

  account ({ ownerAddress, ethers, provider, signer }) {
    if (!ethers) throw new Error(`no ethers specified`)

    const txProvider = provider || ethers.provider
    if (!txProvider) throw new Error(`no provider specified`)

    const accountTxSigner = signer || txProvider.getSigner()
    if (!accountTxSigner) throw new Error(`no signer specified`)

    return new Account({
      ownerAddress,
      environment: this.environment,
      ethers,
      provider: txProvider,
      signer: accountTxSigner
    })
  }

  accountSigner (accountOwnerSigner) {
    if (!accountOwnerSigner) throw new Error(`no accountOwnerSigner specified`)
    return new AccountSigner({
      environment: this.environment,
      signer: accountOwnerSigner
    })
  }

  computeAccountAddress (ownerAddress) {
    const deployerAddress = _.find(this.environment.deployments, { name: 'singletonFactory' }).address
    const implementationAddress = _.find(this.environment.deployments, { name: 'account' }).address
    const chainId = this.environment.chainId 
    const accountDeploymentSalt = this.environment.accountDeploymentSalt
    return computeAccountAddress(
      deployerAddress,
      implementationAddress,
      ownerAddress,
      chainId,
      accountDeploymentSalt
    )
  }
}

module.exports = function (envConf) {
  return new BrinkSDK(envConf)
}
