const util = require('util')
const yargs = require('yargs')
const ManagementApi = require('./management-api')
const Rx = require('rxjs')

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
 * Any inherited Script type will need to override the #definition(ManagementApi) method to specify the Script execution
 * 
 * @author Aurelien Bourdon
 */
class Script {

    /**
     * Create a new Management API script named by the given scriptName
     * 
     * @param {string} scriptName the name of the script (default unnamed-script)
     */
    constructor(scriptName = 'unnamed-script') {
        this.scriptName = scriptName;
    }

    /**
     * Display an information message
     * 
     * @param {string} message the information message to display
     */
    displayInfo(message) {
        if (!argv.silent) {
            console.log(util.format('%s: %s', this.scriptName, message));
        }
    }

    /**
     * Display an error message
     * 
     * @param {string} message the error message to display
     */
    displayError(message) {
        console.error(util.format('%s: Error: %s', this.scriptName, message));
    }

    /**
     * Create a default Rx.Subscriber that will handle error and complete part
     * 
     * @param {function(x: ?T)} next the function that will be called at any next event
     */
    defaultSubscriber(next) {
        return Rx.Subscriber.create(
            next,
            error => {
                this.displayError(util.inspect(error));
                process.exit(1);
            },
            _complete => {
                this.displayInfo('Operation complete.')
            }
        );
    }

    /**
     * Run this Management API Script instance by actually running the script definition specified by #definition(ManagementApi)
     */
    run() {
        const managementApi = ManagementApi.createInstance(new ManagementApi.Settings(argv.url, argv.username, argv.password));
        this.displayInfo("Starting...")
        this.definition(managementApi);
    }

    /**
     * Definition of this Management API Script instance
     * 
     * @param {object} _managementApi the MagementApi instance associated to this Management API Script instance
     */
    definition(_managementApi) {
        throw new Error('No definition found for this script. ManagementApiScript#definition() needs to be overridden');
    }

}

module.exports = {
    Script: Script
}