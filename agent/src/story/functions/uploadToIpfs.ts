import pinataSDK from '@pinata/sdk'

const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT })

export async function uploadJSONToIPFS(jsonMetadata: any): Promise<string> {
    const { IpfsHash } = await pinata.pinJSONToIPFS(jsonMetadata)
    return IpfsHash
}