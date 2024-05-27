import dotenv from 'dotenv';
dotenv.config();
import readline from 'readline';
import { GoogleGenerativeAI } from '@google/generative-ai';
import speech from '@google-cloud/speech';
import { Translate } from '@google-cloud/translate';
import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';

// Initialize Google Cloud clients
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const speechClient = new speech.SpeechClient();
const translateClient = new Translate();
const ttsClient = new textToSpeech.TextToSpeechClient();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let isAwaitingResponse = false;

async function transcribeAudio(audioBuffer) {
    const audio = {
        content: audioBuffer.toString('base64'),
    };
    const request = {
        audio: audio,
        config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'fr-FR', // Source language code
        },
    };
    const [response] = await speechClient.recognize(request);
    const transcription = response.results.map(result => result.alternatives[0].transcript).join('\n');
    return transcription;
}

async function translateText(text, targetLanguage) {
    const [translation] = await translateClient.translate(text, targetLanguage);
    return translation;
}

async function textToSpeechFunction(text, languageCode) {
    const request = {
        input: { text: text },
        voice: { languageCode: languageCode, ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3' },
    };
    const [response] = await ttsClient.synthesizeSpeech(request);
    return response.audioContent;
}

async function run() {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const chat = model.startChat({
        history: [],
        generationConfig: {
            maxOutputTokens: 500,
        },
    });

    async function askAndRespond() {
        if (!isAwaitingResponse) {
            rl.question("You: ", async (msg) => {
                if (msg.toLowerCase() === "exit") {
                    rl.close();
                } else {
                    isAwaitingResponse = true;
                    try {
                        const result = await chat.sendMessageStream(msg);
                        let text = "";
                        for await (const chunk of result.stream) {
                            const chunkText = await chunk.text();
                            console.log("AI: ", chunkText);
                            text += chunkText;
                        }

                        // Translation part
                        const translatedText = await translateText(text, 'es'); // Target language code
                        console.log("Translated AI: ", translatedText);

                        // Text-to-Speech part
                        const translatedAudio = await textToSpeechFunction(translatedText, 'es-ES'); // Target language code
                        fs.writeFileSync('output.mp3', translatedAudio, 'binary');
                        console.log('Translated speech saved to output.mp3');

                        isAwaitingResponse = false;
                        askAndRespond();
                    } catch (error) {
                        console.error("Error:", error);
                        isAwaitingResponse = false;
                    }
                }
            });
        } else {
            console.log("Please wait for the current response to complete.");
        }
    }

    askAndRespond();
}

run();
