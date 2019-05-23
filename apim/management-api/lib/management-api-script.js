const util = require('util')
const yargs = require('yargs')
const ManagementApi = require('./management-api')
const Rx = require('rxjs')

/**
 * Base type for any Management API script.
 * 
 * Any inherited Script type will need to override the #definition(ManagementApi) method to specify the Script execution
 * 
 * @author Aurelien Bourdon
 */
class Script {

    /**
     * Create a new Management API script
     * 
     * @param {string} name the name of the script (default unnamed-script)
     * @param {object} options the specific options to add to the global ones (Script.DEFAULT_SCRIPT_OPTIONS)
     */
    constructor(name = 'unnamed-script', options) {
        this.name = name;

        // Add specific script options to the global ones
        this.argv = Object.assign({}, Script.DEFAULT_SCRIPT_OPTIONS);
        if (options) {
            const that = this;
            Object.keys(options).forEach(optionKey => that.argv = that.argv.option(optionKey, options[optionKey]));
        }
        this.argv = this.argv.argv;
    }

    /**
     * Display an information message
     * 
     * @param {string} message the information message to display
     */
    displayInfo(message) {
        if (!this.argv.silent) {
            console.log(util.format('%s: %s', this.name, message));
        }
    }

    /**
     * Display an error message
     * 
     * @param {string} message the error message to display
     */
    displayError(message) {
        console.error(util.format('%s: Error: %s', this.name, message));
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
        const managementApi = ManagementApi.createInstance(new ManagementApi.Settings(this.argv.url, this.argv.username, this.argv.password));
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

/**
 * Default script options
*/
Script.DEFAULT_SCRIPT_OPTIONS = yargs
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

module.exports = {
    Script: Script
}