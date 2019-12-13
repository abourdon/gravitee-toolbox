# [Gravitee.io API Management](https://gravitee.io/products/apim/)'s Command Line Interface (CLI)

CLI that provides enriched features from the original [Gravitee.io CLI](https://github.com/gravitee-io/graviteeio-cli) version. 

## Yet another CLI?

This CLI is an extended version of the original [Gravitee.io CLI](https://github.com/gravitee-io/graviteeio-cli) that aims to provide:
- Enriched features thanks to the ability to **orchestrate** Gravitee.io Management API commands (e.g., the disable of a set of endpoints based on a given regex of API names)
- Not yet included Management API features by dealing also with additional components directly (e.g., ElasticSearch)
- A (hope so) simple framework to add their own commands and then to enrich CLI with new features

## How does it work?

CLI can be ran by executing the [`gravitee-cli.sh`](./gravitee-cli.sh) script that wraps a set of commands contained into the [commands](./commands) folder.

Each command is built thanks to a (hope so) simple framework to quickly creates your owns. Have a [look](./commands/list-apis.js)!

Finally, CLI can be ran either directly (by executing the [`gravitee-cli.sh`](./gravitee-cli.sh) script) or via Docker (not yet DockerHub ready, you'll need to build the [image](./Dockerfile) yourself). More details below.

## Which commands are available?

Have a look to the [commands](./commands) folder!

## Let me try!

### Prerequisites
 
#### For Docker users

Have a ready to run [Docker](https://www.docker.com/) environment.
Then install image by using:

```bash
$ docker build -t gravitee-cli .
```

Once image installed, you can execute CLI as the following (note the necessary `-it` option to enable user interactivity): 

```
$ docker run -it gravitee-cli list-apis \
    --username user \
    --password password \
    --url https://apim-management-api.url \
    --filter-by-endpoint-target '1.2.3.4'
```

For more details, ask for help!

```
$ docker run gravitee-cli -h
```

#### For non Docker users

The [`gravitee-cli.sh`](./gravitee-cli.sh) are looking for commands stored into the [commands](./commands) folder.
Those commands are actually NodeJS scripts that belong to NodeJS dependencies.

To install those dependencies, you need to have a ready to run [NodeJS](https://nodejs.org/en/) and [NPM](https://www.npmjs.com/) based environment.
To install yours, [NVM](https://github.com/nvm-sh/nvm) could be a good option:

```bash
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
$ nvm install 12.0
```

> **Note:** At the time of writing, the latest NVM version is v0.34.0. Feel free to update it according to the current latest one.

Finally, install the desired dependencies:

```bash
$ cd commands
$ npm install
$ cd ..
```

Once dependencies installed, you can execute CLI as the following:

```
$ ./gravitee-cli.sh list-apis \
    --username user \
    --password password \
    --url https://apim-management-api.url \
    --filter-by-endpoint-target '1.2.3.4'
```

For more details, ask for help!

```
$ ./gravitee-cli.sh -h
```