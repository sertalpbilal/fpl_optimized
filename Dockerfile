FROM sertalpbilal/coin-or-optimization-with-batteries:latest

COPY src /app
WORKDIR /app

CMD python3 -u run.py
