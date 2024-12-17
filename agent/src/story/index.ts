import { http, createWalletClient, createPublicClient, Address, zeroAddress, Account } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { IpMetadata, odyssey, StoryClient, StoryConfig } from '@story-protocol/core-sdk'
import { licensingModuleAbi, MARRIAGE_LICENSE_TERMS } from './constants'
import { parseTxLicenseTokensMintedEvent } from './functions/parseTxLicenseTokensMintedEvent'
import { uploadJSONToIPFS } from './functions/uploadToIpfs'
import { createHash } from 'crypto'

const privateKey: Address = `0x${process.env.AGENT_WALLET_PRIVATE_KEY}`
const account: Account = privateKeyToAccount(privateKey)

const config: StoryConfig = {
    account: account,
    transport: http('https://rpc.odyssey.storyrpc.io'),
    chainId: 'odyssey',
}
const client = StoryClient.newClient(config)

const baseConfig = {
    chain: odyssey,
    transport: http('https://rpc.odyssey.storyrpc.io'),
} as const
const publicClient = createPublicClient(baseConfig)
const walletClient = createWalletClient({
    ...baseConfig,
    account,
})

// must be called by the agent wallet (marilyn or the winner bachelor)
export async function mintLicenseTokens(ipId: Address, childIpId: Address) {
    const req = {
        licensorIpId: ipId,
        licenseTemplate: '0x58E2c909D557Cd23EF90D14f8fd21667A5Ae7a93' as Address,
        licenseTermsId: MARRIAGE_LICENSE_TERMS,
        amount: BigInt(1),
        receiver: childIpId,
        royaltyContext: zeroAddress,
    }

    const { request } = await publicClient.simulateContract({
        abi: licensingModuleAbi,
        address: '0x5a7D9Fa17DE09350F481A53B470D798c1c1aabae',
        functionName: 'mintLicenseTokens',
        account: account,
        args: [req.licensorIpId, req.licenseTemplate, req.licenseTermsId, req.amount, req.receiver, req.royaltyContext],
    })
    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({
        hash,
    })
    const targetLogs = parseTxLicenseTokensMintedEvent(receipt)
    const startLicenseTokenId = targetLogs[0].startLicenseTokenId
    const licenseTokenIds = []
    for (let i = 0; i < 1; i++) {
        licenseTokenIds.push(startLicenseTokenId + BigInt(i))
    }
    return licenseTokenIds
}

// must be called by the child wallet
export async function registerChildAndMakeDerivative(characterJson: any, characterImage: string, licenseTokenIds: bigint[] | string[] | number[]) {
    const ipMetadata: IpMetadata = client.ipAsset.generateIpMetadata({
        title: characterJson.name,
        description: characterJson.system,
        ipType: 'character',
        attributes: [
            {
                key: 'Model Provider',
                value: 'Grok',
            },
        ],
    })

    const nftMetadata = {
        description: `NFT representing ownership of ${characterJson.name}`,
        image: characterImage,
        ...characterJson
    }

    const ipIpfsHash = await uploadJSONToIPFS(ipMetadata)
    const ipHash = createHash('sha256').update(JSON.stringify(ipMetadata)).digest('hex')
    const nftIpfsHash = await uploadJSONToIPFS(nftMetadata)
    const nftHash = createHash('sha256').update(JSON.stringify(nftMetadata)).digest('hex')

    const response = await client.ipAsset.mintAndRegisterIpAndMakeDerivativeWithLicenseTokens({
        spgNftContract: '0x09D36f0b24f8CbBfe2cC7d14276d408da7EA4f7d',
        licenseTokenIds,
        ipMetadata: {
            ipMetadataURI: `https://ipfs.io/ipfs/${ipIpfsHash}`,
            ipMetadataHash: `0x${ipHash}`,
            nftMetadataURI: `https://ipfs.io/ipfs/${nftIpfsHash}`,
            nftMetadataHash: `0x${nftHash}`,
        },
        txOptions: { waitForTransaction: true },
    })

    console.log('Child Register Derivative Response:', response);
}