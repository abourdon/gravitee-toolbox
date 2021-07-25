const util = require('util');
const readline = require('readline');
const yargs = require('yargs');
const ManagementApi = require('./management-api');
const { Console, LOG_LEVEL } = require('./console');
const Rx = require('rxjs');

const CSV_SEPARATOR = ',';
const JSON_OUTPUT_REPLACER = null;
const JSON_OUTPUT_SPACES_INDENT = 2;

/**
 * Base type for any Management API Command Line Interface's command.
 *
 * Any inherited CliCommand type will need to override the #definition(ManagementApi) method to specify the command execution
 *
 * @author Aurelien Bourdon
 */
class CliCommand {

    /**
     * Create a new command that will be included in the CLI
     *
     * @param {string} name of this CLI command
     * @param {string} description description of this CLI command
     * @param {object} specificOptions specific options of this CLI command
     */
    constructor(name, description, specificOptions = {}) {
        this.name = name;
        this.description = description;
        this.specificOptions = specificOptions;
        this.argv = null; // will be initialised further
        this.console = null; // will be initialised further
    }

    /**
     * Returns default options for any CliCommand
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
            },
            'v': {
                alias: 'verbose',
                describe: "Debug messages will be also displayed",
                type: 'boolean',
            }
        });
    }

    /**
     * Get (full, i.e., specific + default) options of this ManagementApi script
     */
    get options() {
        return Object.assign(CliCommand.defaultOptions(), this.specificOptions);
    }

    /**
     * Display an error message and exit process with error
     *
     * @param {string} message the error message to display
     */
    handleError(error) {
        this.console.error(util.inspect(error));
        this.exitWithError();
    }

    /**
     *
     * Exit command with error (status 1 by default)
     *
     * @param status the exit status code (1 by default)
     */
    exitWithError(status = 1) {
        process.exit(status);
    }

    /**
     * Create a common Rx.Subscriber that will handle error and complete part
     *
     * @param {function(x: ?T)} next the function that will be called at any next event
     * @param {function(x: ?T)} error the function that will be called on error
     */
    defaultSubscriber(next = () => {
    }, error = this.console.error.bind(this.console)) {
        return Rx.Subscriber.create(
            next,
            error,
            _complete => {
                this.console.info('Done.')
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
    askForApproval(objectsToApprove = [], next = () => {}, end = () => {}, messageHeader = "The following objects will be concerned by the operation") {
        // If no object need to be approved, continue
        if (!objectsToApprove || objectsToApprove.length === 0) {
            return next();
        }

        // If not, ask for approval
        let question = objectsToApprove.reduce((acc, object) =>
            acc + util.format("- %s\n", object),
            util.format("%s:\n", messageHeader)
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
            .usage('$0 [options]', this.description)
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
     * Initialized Console attached to this ManagementAPI instance
     */
    _initConsole() {
        const minimumLogLevel = this.argv.silent ? LOG_LEVEL.warn.level : this.argv.verbose ? LOG_LEVEL.debug.level : LOG_LEVEL.info.level;
        this.console = new Console(this.name, minimumLogLevel)
    }

    /**
     * Run this Management API Script instance by actually running the script definition specified by #definition(ManagementApi)
     */
    run() {
        this._initArgv();
        this._initConsole();
        this.managementApi = ManagementApi.createInstance(this.console, new ManagementApi.Settings(this.argv['management-api-url'], this.argv['management-api-url-header']));
        this.console.info("Starting...");
        const prerequisites = this.checkPrerequisites();
        if (!prerequisites.satisfied) {
            this.handleError("Prerequisites aren't satisfied: " + prerequisites.description)
        }
        // TODO remove managementApi argument as it is now directly owned by the CliCommand instance itself
        this.definition(this.managementApi);
    }

    /**
     * Check prerequisites before applying #definition()
     *
     * @returns {CliCommandPrerequisites} a CliCommandPrerequisites that describes the prerequisites status of the associated CliCommand
     */
    checkPrerequisites() {
        return CliCommandPrerequisites.createSatisfied();
    }

    /**
     * Definition of this CLI command
     *
     * @param {object} _managementApi the MagementApi instance associated to this CLI command
     */
    // TODO remove managementApi argument as it is now directly owned by the CliCommand instance itself
    definition(_managementApi) {
        throw new Error('No definition found for this script. CliCommand#definition() needs to be overridden');
    }

}

/**
 * Base type for any CliCommand reporter (aka CliCommand subscriber)
 *
 * @author Aurelien Bourdon
 */
class CliCommandReporter {

    constructor(cliCommand) {
        if (cliCommand === undefined) {
            throw new Error('A CliCommandReporter cannot be instanciated without its associated CliCommand');
        }
        this.cliCommand = cliCommand;
    }

    next(next) {
        this.doNext(next);
    }

    doNext(next) {
        throw new Error('No next action defined for this CliCommand reporter. CliCommandReporter#doNext() needs to be overridden');
    }

    error(error) {
        this.doError(error);
    }

    doError(error) {
        this.cliCommand.handleError(error).bind(this.cliCommand);
    }

    complete() {
        this.doComplete();
        this.cliCommand.console.info('Done.');
    }

    doComplete() {
        // Nothing by default
    }

}

/**
 * Prerequisites before applying a CliCommand
 *
 * @author Aurelien Bourdon
 */
class CliCommandPrerequisites {

    /**
     * Create a new CliCommandPrerequisites with the predefined validity status and optional description
     *
     * @param {boolean} satisfied if prerequisites of the related CliCommand are satisfied or not
     * @param {string} description additional description of the prerequisites status (especially in case of failure)
     */
    constructor(satisfied, description) {
        this.satisfied = satisfied;
        this.description = description;
    }

    /**
     * Create a satisfied CliCommandPrerequisites
     *
     * @returns {CliCommandPrerequisites} a satisfied CliCommandPrerequisites
     */
    static createSatisfied() {
        return new CliCommandPrerequisites(true);
    }

    /**
     * Create a not satisfied CliCommandPrerequisites
     *
     * @param description why prerequisites of the related CliCommand cannot be satisfied
     * @returns {CliCommandPrerequisites} a not satisfied CliCommandPrerequisites
     */
    static createNotSatisfied(description) {
        return new CliCommandPrerequisites(false, description);
    }

}

/**
 * Dedicated CliCommandReporter that produce live display in CSV format.
 *
 * @author Aurelien Bourdon
 */
class CsvCliCommandReporter extends CliCommandReporter {

    /**
     * New CsvCliCommandReporter with its given header
     *
     * @param header array of CSV header names, in order.
     * @param cliCommand the associated CliCommand to this CliCommandReporter
     */
    constructor(header, cliCommand) {
        super(cliCommand);
        this.header = header;
        this.firstEvent = true;
    }

    /**
     * Line to add to the CSV, in an array format with the same column order as this.header
     *
     * @param line
     */
    doNext(line) {
        if (this.firstEvent) {
            this.cliCommand.console.info('Results (in CSV format):');
            this._displayLine(this.header);
            this.firstEvent = false;
        }
        this._displayLine(line);
    }

    /**
     * Display a line contained into an array, in order.
     *
     * @param line the array line to display
     * @private
     */
    _displayLine(line) {
        this.cliCommand.console.raw(line.join(CSV_SEPARATOR));
    }

}

/**
 * Dedicated CliCommandReporter that produce live display in JSON format.
 *
 * @author Aurelien Bourdon
 */
 class JsonCliCommandReporter extends CliCommandReporter {

    /**
     * Create a new JsonCliCommandReporter instance with its associated CliCommand instance
     * 
     * @param {object} cliCommand 
     */
    constructor(cliCommand) {
        super(cliCommand);
    }

    /**
     * Display the given object under pretty JSON format
     *
     * @param object
     */
    doNext(object) {
        this.cliCommand.console.raw(JSON.stringify(object, JSON_OUTPUT_REPLACER, JSON_OUTPUT_SPACES_INDENT));
    }

}

module.exports = {
    CliCommand: CliCommand,
    CliCommandPrerequisites: CliCommandPrerequisites,
    CliCommandReporter: CliCommandReporter,
    CsvCliCommandReporter: CsvCliCommandReporter,
    JsonCliCommandReporter: JsonCliCommandReporter
};