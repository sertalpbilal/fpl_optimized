FROM sertalpbilal/coin-or-optimization-with-batteries:latest

RUN pip install cryptography pycryptodome aiohttp asyncio
COPY src /app
WORKDIR /app

CMD python3 -u run.py
