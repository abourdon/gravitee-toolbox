# [Gravitee.io API Management](https://gravitee.io/products/apim/)'s command line

## Prequesities
 
### For Docker users

Have a ready to run [Docker](https://www.docker.com/) environment.
Then install image by using:

```bash
$ docker build -t gravitee-cli .
```

### For non-Docker users

Have a ready to run [NodeJS](https://nodejs.org/en/) and [NPM](https://www.npmjs.com/) based environment.
To install yours, [NVM](https://github.com/nvm-sh/nvm) could be a good option:

```bash
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
$ nvm install 12.0
```

> **Note:** At the time of writing, the latest NVM version is v0.34.0. Feel free to update it according to the current latest one.

Finally, install the desired dependencies:

```bash
$ npm install
```

## Command line execution

### For Docker users

Example

```
$ docker run gravitee-cli list-apis \
    --username user \
    --password password \
    --url https://apim-management-api.url \
    --filter-by-endpoint-target '1.2.3.4'
```

Need help?

```
$ docker run gravitee-cli -h
```

### For non-Docker users

Example

```
$ ./gravitee-cli list-apis \
    --username user \
    --password password \
    --url https://apim-management-api.url \
    --filter-by-endpoint-target '1.2.3.4'
```

Need help?

```
$ ./gravitee-cli -h
```