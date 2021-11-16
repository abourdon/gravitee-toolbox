FROM node:16-alpine

WORKDIR /usr/src/gravitee-cli

# Copy project files (except those ignored by .dockerignore)
COPY . ./

# Add all necessary dependencies not already packaged in the alpine environment for both build and run time
RUN apk add --no-cache bash \
    && cd commands \
    # No necessary to be SSL/TLS strict for public packages and make it compatible with any company proxy
    && npm config set strict-ssl=false \
    && npm ci --only=production \
    && cd ..

# Start the image by executing main script and waiting for additional arguments
ENTRYPOINT ["./gravitee-cli.sh"]
