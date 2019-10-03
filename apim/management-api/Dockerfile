FROM node:12.0-alpine

WORKDIR /usr/src/gravitee-cli

# Copy project files (except those ignored by .dockerignore)
COPY . ./

# Add all necessary dependencies not already packaged in the alpine environment for both build and run time
RUN apk add --no-cache bash \
    && apk add --no-cache --virtual .build-dependencies \
        python \
        make \
        g++ \
    && cd commands \
    && npm ci --only=production \
    && cd .. \
    && apk del .build-dependencies

# Start the image by executing main script and waiting for additional arguments
ENTRYPOINT ["./gravitee-cli.sh"]