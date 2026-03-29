import os
import azure.cognitiveservices.speech as speechsdk
from azure.storage.blob import BlobClient

from config import (
    SPEECH_KEY,
    SPEECH_REGION,
    STORAGE_CONNECTION_STRING,
    AZURE_BLOB_CONTAINER
)


def generate_audio(note_id, explanations):

    if not STORAGE_CONNECTION_STRING:
        raise Exception("Azure Storage connection string missing")

    speech_config = speechsdk.SpeechConfig(
        subscription=SPEECH_KEY,
        region=SPEECH_REGION
    )

    voices = {
        "en": "en-US-JennyNeural",
        "hi_en": "hi-IN-SwaraNeural",
        "hi": "hi-IN-SwaraNeural",
        "te": "te-IN-ShrutiNeural",
        "ta": "ta-IN-PallaviNeural",
        "bn": "bn-IN-TanishaaNeural"
    }

    audio_urls = {}

    os.makedirs("temp_audio", exist_ok=True)

    for lang, text in explanations.items():
        if text is None:
            continue

        text = str(text).strip()

        if len(text) == 0:
            continue

        # Azure speech sometimes fails on very long text
        text = text[:2000]

        speech_config.speech_synthesis_voice_name = voices.get(lang, "en-US-JennyNeural")

        audio_filename = f"{note_id}_{lang}.mp3"
        audio_path = os.path.join("temp_audio", audio_filename)

        audio_config = speechsdk.audio.AudioOutputConfig(filename=audio_path)

        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=audio_config
        )

        result = synthesizer.speak_text_async(text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:

            blob_client = BlobClient.from_connection_string(
                conn_str=STORAGE_CONNECTION_STRING,
                container_name=AZURE_BLOB_CONTAINER,
                blob_name=audio_filename
            )

            with open(audio_path, "rb") as audio_file:
                blob_client.upload_blob(audio_file, overwrite=True)

            audio_urls[lang] = blob_client.url

            try:
                os.remove(audio_path)
            except:
                pass

        else:
            print(f"\nSpeech generation failed for {lang}")

            cancellation = result.cancellation_details

            if cancellation:
                print("Reason:", cancellation.reason)

                if cancellation.reason == speechsdk.CancellationReason.Error:
                    print("Error details:", cancellation.error_details)

    return audio_urls


# 🔽 ADD BELOW EXISTING FUNCTIONS (last ~30-40 lines of file)

import time
import os
def generate_audio_for_chat(text: str):

    speech_config = speechsdk.SpeechConfig(
        subscription=SPEECH_KEY,
        region=SPEECH_REGION
    )

    speech_config.speech_synthesis_voice_name = "en-US-JennyNeural"

    os.makedirs("temp_audio", exist_ok=True)

    filename = f"chat_{int(time.time())}.mp3"
    filepath = os.path.join("temp_audio", filename)

    audio_config = speechsdk.audio.AudioOutputConfig(filename=filepath)

    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=audio_config
    )

    print("Generating audio...")

    result = synthesizer.speak_text_async(text).get()

    print("TTS finished")

    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:

        blob_client = BlobClient.from_connection_string(
            conn_str=STORAGE_CONNECTION_STRING,
            container_name=AZURE_BLOB_CONTAINER,
            blob_name=filename
        )

        with open(filepath, "rb") as audio_file:
            blob_client.upload_blob(audio_file, overwrite=True)

        try:
            os.remove(filepath)
        except:
            pass
        
        print("Audio uploaded:", blob_client.url)
        return blob_client.url

    else:
        print("Chat audio generation failed")
        return None