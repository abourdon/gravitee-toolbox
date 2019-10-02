const util = require('util');
const readline = require('readline');
const yargs = require('yargs');
const ManagementApi = require('./management-api');
const Rx = require('rxjs');

const LOG_LEVEL = {
    info: 'INFO',
    error: 'ERROR'
};

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
            'header': {
                alias: 'management-api-url-header',
                describe: 'Optional header to add to access to the Management API base URL. Format: "key:value"',
                type: 'array'
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
     * Display a log message
     *
     * @param level the log level message
     * @param message the message to log
     * @private
     */
    _displayLog(level, message) {
        console.log(util.format('%s %s [%s] %s', this.name, new Date(), level, message));
    }

    /**
     * Display an information message
     *
     * @param {string} message the information message to display
     */
    displayInfo(message) {
        if (!this.argv.silent) {
            this._displayLog(LOG_LEVEL.info, message);
        }
    }

    /**
     * Display an error message
     *
     * @param {string} message the error message to display
     */
    displayError(message) {
        this._displayLog(LOG_LEVEL.error, message);
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
     * @param {function(x: ?T)} error the function that will be called on error
     */
    defaultSubscriber(next = () => {
    }, error = this.displayError.bind(this)) {
        return Rx.Subscriber.create(
            next,
            error,
            _complete => {
                this.displayInfo('Done.')
            }
        );
    }

    /**
     * Ask user for confirmation before modifying a list of objects concerned by this script
     *
     * @param objectsToApprove list of objects that needs user approval before to apply the next function
     * @param next the next operation that will modify the list of objects
     * @param end the end operation that will need to apply in case of user cancellation
     */
    askForApproval(objectsToApprove = [], next = () => {
    }, end = () => {
    }) {
        // If no object need to be approved, continue
        if (!objectsToApprove || objectsToApprove.length === 0) {
            return next();
        }

        // If not, ask for approval
        let question = objectsToApprove.reduce((acc, object) =>
            acc + util.format("- %s\n", object),
            "The following objects will be concerned by the operation:\n"
        );
        question += util.format('Continue? (y/n) ');
        const ask = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        ask.question(question, answer => {
            // Close user interface
            ask.close();

            // If user cancels, then abort and call the end given function
            return answer === 'y' ? next() : end();
        });
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
            .strict(true);
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
        const managementApi = ManagementApi.createInstance(new ManagementApi.Settings(this.argv['management-api-url'], this.argv['management-api-url-header']));
        this.displayInfo("Starting...");
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