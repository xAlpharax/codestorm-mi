# codestorm-mi

My team's entry in CodeStorm@MI Hackathon 2025. Winning first place by making Educational AI Agents for both students and professors alike.

This hackathon was organized by the Faculty of Mathematics and Computer Science at Transilvania University of Brasov.

## Technologies

We wanted to do something with [agno](https://www.agno.com/) as it is a pretty great framework to develop in, but it's not quite ready yet. You may find a couple "cookbook" examples of how to use it and why it's cool for developing agents under `./agno-testing/`. I may come back to it later.

As for the actual technologies we settled for:

Both the Video Understanding and LaTeX Generator APIs were made with:
- Python
- FastAPI
- uvicorn
- pydantic
- Google-GenAI

We made use of `Gemini 2.5 Pro Experimental/Preview 03-25` as it is the SOTA model on both [livebench](https://livebench.ai) and [lmarena](https://lmarena.ai/). This model performs great on pretty much all task but can get quite rate-limited, we also used a fallback for `Gemini 2.0 Flash Thinking Experimental 01-21` as it is still a great vision, math and all-rounded thinking model.

As for the WebUI, vibe-coding (made by [@CesarPetrescu](https://github.com/CesarPetrescu)) got the interface and functionalities pretty far:

The backend:
- Python
- Requests
- Flask
- Flask_CORS (Flask is not a great package particularly)
- gunicorn
- Redis

It was used to do Flowise API calls to our Flowise self-hosted instance of custom made chatflows for this project, leveraging Redis, Vector Stores, LangChain and Agentic RAG techniques with `QwQ-32B` and `mistral-small-3.1-24b-instruct-2503` as our local LLMs.

The frontend:
- Vite
- React
- TypeScript
- Tailwind
- Yarn
- ChatBubble Embed from Flowise

And other boring webdev shenanigans (probably).

We used our VPN to develop securely and remotely, we also run IP whitelisting on our public API domains so anything that might seem "giving" is secure in fact. The backend may be completely done in FastAPI and unified in the future if the project doesn't die and actually gets traction with the University.

## Requirements

Use `pyenv` to make a virtual environment for the backend components:

```bash
cd codestorm-mi

pyenv install 3.10.14

pyenv virtualenv codestorm-mi

pyenv activate codestorm-mi

pip install -r requirements.txt
```

This should take care of all the dependencies (Hopefully thoroughly tested). Also add a `GEMINI_API_KEY` in a `.env` where needed (Video Understanding and LaTeX Writing APIs)

## Running

To get the web backend running:

```bash
cd web-interface/backend

gunicorn app:app --workers 4 --bind 0.0.0.0:5020
```

Now also run:

```bash
cd ../../video_understanding

uvicorn video_understanding:app --reload --host 0.0.0.0 --port 8000

cd ../latex_writing

uvicorn latex_writing:app --reload --host 0.0.0.0 --port 8001
```

To get the web frontend running, ensure yarn is installed:

```bash
cd ../web-interface/frontend

yarn install

yarn run dev --host 0.0.0.0
```

## Video Showcase

[YouTube Video Demonstration](https://youtu.be/S779G78ZZpM?si=c52Uy-ZUKIMh7aZr)

## Contributing

I'm actively supporting FOSS collaboration, so, if you feel like you can help in any way, file an issue in the *Issues* tab or submit a Pull Request and I will go through it.

## License

Copyright (C) xAlpharax

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see https://www.gnu.org/licenses/.
