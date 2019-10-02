FROM node:12.0-alpine

WORKDIR /usr/src/gravitee-cli

# Copy project files (except those ignored by .dockerignore)
COPY . ./

# Build node files by installing necessary dependencies not already packaged in the alpine environment
RUN cd commands \
    && apk add --no-cache --virtual .gyp \
        python \
        make \
        g++ \
    && npm ci --only=production \
    && apk del .gyp \
    && cd ..

# Start the image by executing main script and waiting for additional arguments
ENTRYPOINT ["./gravitee-cli.sh"]