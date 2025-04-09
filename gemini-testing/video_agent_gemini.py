import base64
import os
from google import genai
from google.genai import types

from dotenv import load_dotenv
load_dotenv()

client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
)

print("Uploading file...")
video_file = client.files.upload(file="GreatRedSpot.mp4")
print(f"Completed upload: {video_file.uri}")

import time

# Check whether the file is ready to be used.
while video_file.state.name == "PROCESSING":
    print('.', end='')
    time.sleep(1)
    video_file = client.files.get(name=video_file.name)

if video_file.state.name == "FAILED":
  raise ValueError(video_file.state.name)

print('Done')

def generate():

    # files = [
        # Please ensure that the file is available in local system working direrctory or change the file path.
        # client.files.upload(file="GreatRedSpot.mp4"),
        # video_file,
    # ]
    model = "gemini-2.5-pro-exp-03-25"
    contents = [
        # types.Content(
            # role="user",
            # parts=[
                # types.Part.from_uri(
                    # file_uri=str(files[0].uri),
                    # mime_type=str(files[0].mime_type),
                # ),
            # ],
        # ),
        # types.Content(
            # role="user",
            # parts=[
                # types.Part.from_text(text="""Tell me about this video"""),
            # ],
        # ),
        video_file,
        """Tell me about this video""",
        # types.Content(
            # parts=[
                # types.Part(text='Can you summarize this video?'),
                # types.Part(
                    # file_data=types.FileData(file_uri='https://www.youtube.com/watch?v=9hE5-98ZeCg')
                # )
            # ]
        # ),
    ]
    generate_content_config = types.GenerateContentConfig(
        response_mime_type="text/plain",
    )

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        print(chunk.text, end="")

if __name__ == "__main__":
    generate()
