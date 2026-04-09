FROM alpine:latest

RUN apk add --no-cache curl bash

# Install ngrok
RUN curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apk/keys/ngrok.rsa.pub > /dev/null && \
    echo "https://ngrok-agent.s3.amazonaws.com/alpine/stable/main" | tee /etc/apk/repositories.d/ngrok.repo > /dev/null && \
    apk add --no-cache ngrok

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
