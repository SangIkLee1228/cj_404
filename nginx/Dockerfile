FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY generate-cert.sh /docker-entrypoint.d/10-generate-cert.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/10-generate-cert.sh && \
    chmod +x /docker-entrypoint.d/10-generate-cert.sh
