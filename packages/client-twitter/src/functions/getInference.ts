import axios from "axios";

export async function getInference(id: string) {
    const url = "https://api.us1.bfl.ai/v1/get_result";
    const headers = {
        "Content-Type": "application/json",
        "X-Key": process.env.BFL_API_KEY,
    };

    try {
        const response = await axios.get(url, { headers, params: { id } });
        return response.data;
    } catch (error) {
        throw new Error(`Inference retrieval failed: ${error}`);
    }
}
