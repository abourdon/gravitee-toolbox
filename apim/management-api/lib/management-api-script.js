const util = require('util')
const ManagementApi = require('./management-api')
const yargs = require('yargs')

// Check and retrieve command line arguments
const argv = yargs
    .usage('Usage: $0 [options]')
    .option('url', {
        alias: 'management-api-url',
        describe: 'Management API base URL',
        type: 'string',
        demandOption: true
    })
    .option('u', {
        alias: 'username',
        describe: 'Username to connect to the Management API',
        type: 'string',
        demandOption: true
    })
    .option('p', {
        alias: 'password',
        describe: "Username's password to connect to the Management API",
        type: 'string',
        demandOption: true
    })
    .option('s', {
        alias: 'silent',
        describe: "Only errors will be displayed, but no information message",
        type: 'boolean'
    })
    .help('h')
    .alias('h', 'help')
    .version(false)
    .wrap(null)
    .argv;

/**
 * Base type for any Management API script.
 * 
 * @author Aurelien Bourdon
 */
class ManagementApiScript {

    constructor(scriptName = 'unnamed-script') {
        this.scriptName = scriptName;
    }

    displayInfo(message) {
        if (!argv.silent) {
            console.log(util.format('%s: %s', this.scriptName, message));
        }
    }

    displayError(message) {
        console.error(util.format('%s: Error: %s', this.scriptName, message));
    }

    run() {
        const managementApi = ManagementApi.createInstance(new ManagementApi.Settings(argv.url, argv.username, argv.password));
        this.displayInfo("Starting...")
        this.definition(managementApi);
    }

    definition(_managementApi) {
        throw new Error('No definition found for this script. ManagementApiScript#definition() needs to be overridden');
    }

}

module.exports = {
    ManagementApiScript
}