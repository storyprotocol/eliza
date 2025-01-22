import axios from "axios";

export async function finetuneInference(
    finetuneId: string,
    prompt: string,
    finetuneStrength = 1.2,
    endpoint = "flux-pro-1.1-ultra-finetuned",
    additionalParams: Record<string, any> = {}
): Promise<{ id: string }> {
    const url = `https://api.us1.bfl.ai/v1/${endpoint}`;
    const headers = {
        "Content-Type": "application/json",
        "X-Key": process.env.BFL_API_KEY,
    };

    const payload = {
        finetune_id: finetuneId,
        finetune_strength: finetuneStrength,
        prompt,
        ...additionalParams,
    };

    try {
        const response = await axios.post(url, payload, { headers });
        return response.data;
    } catch (error) {
        throw new Error(`Finetune inference failed: ${error}`);
    }
}
