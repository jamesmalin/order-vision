import {TranslationServiceClient} from '@google-cloud/translate';
const projectId = "990478513897"; // BIO-RAD
const location = "global";
const translationClient = new TranslationServiceClient({keyFilename: "credentials-documentai.json"});

export async function translateText(item, target, mimeType = "text/plain") {
  try {
    const request = {
      parent: `projects/${projectId}/locations/${location}`,
      contents: [item.text],
      mimeType: mimeType, // mime types: text/plain, text/html
      targetLanguageCode: target,
    };
  
    // Run request
    const [response] = await translationClient.translateText(request, {maxResults: 1});

    // console.log(response.translations);

    // const translated = response.translations[0].translatedText;
    
    return response;
  } catch (error) {
    console.error('Error translating text:', error);
    return item; // Return the original item on failure
  }
}