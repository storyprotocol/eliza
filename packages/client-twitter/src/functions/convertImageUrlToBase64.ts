import axios from "axios";

export async function convertImageUrlToBase64(
    imageUrl: string
): Promise<string> {
    // Fetch the image and convert it to base64
    const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
    });
    const base64Image = Buffer.from(imageResponse.data, "binary").toString(
        "base64"
    );
    return base64Image;
}
