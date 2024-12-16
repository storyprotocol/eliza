import { licensingModuleAbi } from "../constants"
import { decodeEventLog, TransactionReceipt } from "viem"

export function parseTxLicenseTokensMintedEvent(txReceipt: TransactionReceipt) {
    const targetLogs = []
    for (const log of txReceipt.logs) {
        try {
            const event = decodeEventLog({
                abi: licensingModuleAbi,
                eventName: 'LicenseTokensMinted',
                data: log.data,
                topics: log.topics,
            })
            if (event.eventName === 'LicenseTokensMinted') {
                targetLogs.push(event.args)
            }
        } catch (e) {
            /* empty */
        }
    }
    return targetLogs
}