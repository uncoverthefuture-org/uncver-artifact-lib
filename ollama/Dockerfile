FROM docker.io/ollama/ollama:latest

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV OLLAMA_HOST=0.0.0.0
ENV OLLAMA_KEEP_ALIVE=5m

EXPOSE 11434

ENTRYPOINT ["/entrypoint.sh"]
CMD []
