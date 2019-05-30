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
class ManagementApiScript {

    /**
     * Create a new ManagementApi script by specifying its name and specific options
     * 
     * @param {string} name the ManagementApi script name
     * @param {object} specificOptions specific options of this ManagementApi script
     */
    constructor(name = 'unnamed-script', specificOptions = {}) {
        this.name = name;
        this.specificOptions = specificOptions;
    }

    /**
     * Returns default options for any Script
     */
    static defaultOptions() {
        return Object.assign({}, {
            'url': {
                alias: 'management-api-url',
                describe: 'Management API base URL',
                type: 'string',
                demandOption: true
            },
            'u': {
                alias: 'username',
                describe: 'Username to connect to the Management API',
                type: 'string',
                demandOption: true
            },
            'p': {
                alias: 'password',
                describe: "Username's password to connect to the Management API",
                type: 'string',
                demandOption: true
            },
            's': {
                alias: 'silent',
                describe: "Only errors will be displayed, but no information message",
                type: 'boolean'
            }
        });
    }

    /**
     * Get (full, i.e., specific + default) options of this ManagementApi script
     */
    get options() {
        return Object.assign(ManagementApiScript.defaultOptions(), this.specificOptions);
    }

    /**
     * Display a message as it without any log level
     * 
     * @param {string} message the message to display as it without any log level
     */
    displayRaw(message) {
        console.log(message);
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
     * Display an error message and exit process with error
     * 
     * @param {string} message the error message to display
     */
    handleError(error) {
        this.displayError(util.inspect(error));
        process.exit(1);
    }

    /**
     * Create a common Rx.Subscriber that will handle error and complete part
     * 
     * @param {function(x: ?T)} next the function that will be called at any next event
     */
    defaultSubscriber(next = () => { }) {
        return Rx.Subscriber.create(
            next,
            this.displayError,
            _complete => {
                this.displayInfo('Done.')
            }
        );
    }

    /**
     * Initialize this ManagementApi script command line arguments handler 
     */
    _initArgv() {
        // Initialize yargs
        this.argv = yargs
            .usage('Usage: $0 [options]')
            .help('h')
            .alias('h', 'help')
            .version(false)
            .wrap(null)
        // Add this ManagementApi script options
        Object.keys(this.options).forEach(optionKey => {
            this.argv = this.argv.option(optionKey, this.options[optionKey])
        });
        // Process to the check
        this.argv = this.argv.argv;
    }

    /**
     * Run this Management API Script instance by actually running the script definition specified by #definition(ManagementApi)
     */
    run() {
        this._initArgv();
        const managementApi = ManagementApi.createInstance(new ManagementApi.Settings(this.argv['management-api-url']));
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

module.exports = ManagementApiScript;