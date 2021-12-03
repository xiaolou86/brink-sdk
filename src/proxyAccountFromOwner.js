const { ACCOUNT_FACTORY } = require('@brinkninja/core/constants')
const saltedDeployAddress = require('./saltedDeployAddress')
const proxyBytecode = require('./proxyBytecode')

function proxyAccountFromOwner (proxyOwnerAddress) {
  const { address: proxyAccountAddress } = saltedDeployAddress(
    ACCOUNT_FACTORY, proxyBytecode(proxyOwnerAddress), [], []
  )
  return proxyAccountAddress
}

module.exports = proxyAccountFromOwner
